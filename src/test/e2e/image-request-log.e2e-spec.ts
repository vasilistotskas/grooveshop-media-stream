import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import type { MockInstance } from 'vitest'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import * as process from 'node:process'
import { Test, TestingModule } from '@nestjs/testing'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { IMAGE_REQUEST_LOG_CONTEXT } from '#microservice/API/middleware/image-request-log.middleware'
import { IMAGE_DECODE_LOG_CONTEXT } from '#microservice/Correlation/utils/image-request-log.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import MediaStreamModule from '#microservice/media-stream.module'

/**
 * The per-request log line, end to end: a real app against a local upstream
 * fixture, one request per outcome, asserting the fields of the one line
 * each request emits. Runs against real Redis like the rest of the suite;
 * every image name is unique per run so no earlier run's cache answers.
 */

const RUN = `${process.pid}-${Date.now()}`
const MB = 1024 * 1024

function route(name: string, format = 'webp'): string {
	return `/media_stream-image/media/acme/uploads/${name}/64/64/contain/entropy/transparent/0/80.${format}`
}

/** A non-uniform PNG, `side` pixels square; random noise barely compresses, so its size tracks the pixel count. */
async function noisePng(side: number): Promise<Buffer> {
	const noise = Buffer.alloc(side * side * 3)
	for (let i = 0; i < noise.length; i++) {
		noise[i] = (i * 2654435761) % 256
	}
	return sharp(noise, { raw: { width: side, height: side, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer()
}

describe('image request log (e2e)', () => {
	let app: INestApplication
	let moduleFixture: TestingModule
	let upstream: Server
	let event: MockInstance
	const bodies = new Map<string, Buffer>()

	/** Request `path`, then return the fields of the one line logged for it. */
	async function lineFor(path: string, headers: Record<string, string> = {}): Promise<{ level: string, fields: Record<string, unknown>, status: number }> {
		const response = await request(app.getHttpServer()).get(path).set(headers)
		const correlationId = response.headers['x-correlation-id']
		expect(correlationId).toBeDefined()

		const lines = await vi.waitFor(() => {
			const matching = event.mock.calls.filter(([, , fields, context]) => context === IMAGE_REQUEST_LOG_CONTEXT && (fields as Record<string, unknown>).correlation_id === correlationId)
			expect(matching.length).toBeGreaterThan(0)
			return matching
		})
		expect(lines).toHaveLength(1)
		const [level, , fields] = lines[0]
		return { level: level as string, fields: fields as Record<string, unknown>, status: response.status }
	}

	beforeAll(async () => {
		const png = await noisePng(100)
		// Over the 1 MB SVG limit, under the 8 MB PNG one.
		const bigPng = await noisePng(700)
		if (bigPng.length <= MB) {
			throw new Error(`fixture PNG is ${bigPng.length} bytes; it must exceed the 1 MB SVG limit`)
		}
		const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><!--${'x'.repeat(2 * MB)}--></svg>`)

		bodies.set(`/media/acme/uploads/ok-${RUN}.png`, png)
		bodies.set(`/media/acme/uploads/svg-as-png-${RUN}.png`, svg)
		bodies.set(`/media/acme/uploads/png-as-svg-${RUN}.svg`, bigPng)
		bodies.set(`/media/acme/uploads/gzip-${RUN}.png`, Buffer.from([0x1F, 0x8B, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]))

		upstream = createServer((req, res) => {
			const body = bodies.get(req.url || '')
			if (!body) {
				res.writeHead(404)
				res.end('not found')
				return
			}
			res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': body.length })
			res.end(body)
		})
		await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
		const address = upstream.address()
		if (typeof address === 'object' && address) {
			vi.stubEnv('BACKEND_URL', `http://127.0.0.1:${address.port}`)
		}

		event = vi.spyOn(CorrelatedLogger, 'event')

		moduleFixture = await Test.createTestingModule({ imports: [MediaStreamModule] }).compile()
		app = moduleFixture.createNestApplication()
		await app.init()
	})

	afterAll(async () => {
		event?.mockRestore()
		try {
			await app?.close()
			await moduleFixture?.close()
		}
		catch (error) {
			if (!(error instanceof Error) || !error.message.includes('Connection is closed')) {
				console.error('Error during e2e cleanup:', error)
			}
		}
		if (upstream) {
			await new Promise<void>(resolve => upstream.close(() => resolve()))
		}
		vi.unstubAllEnvs()
	})

	it('logs a processed miss with every field, then the memory hit, then the 304', async () => {
		const path = route(`ok-${RUN}.png`)

		const miss = await lineFor(path)
		expect(miss.status).toBe(200)
		expect(miss.level).toBe('log')
		expect(miss.fields).toMatchObject({
			schema: 'acme',
			source: 'UPLOADED_MEDIA',
			path: `media/acme/uploads/ok-${RUN}.png/64/64/contain/entropy/transparent/0/80.webp`,
			width: 64,
			height: 64,
			fit: 'contain',
			position: 'entropy',
			format: 'webp',
			quality: 80,
			cache: 'miss',
			input_format: 'png',
			input_bytes: bodies.get(`/media/acme/uploads/ok-${RUN}.png`)!.length,
			output_format: 'webp',
			output_bytes: expect.any(Number),
			admission_wait_ms: expect.any(Number),
			duration_ms: expect.any(Number),
			status: 200,
			outcome: 'ok',
		})
		expect(miss.fields.error).toBeUndefined()

		// The pre-decode line, written before Sharp saw the bytes.
		const decodes = event.mock.calls.filter(([, , fields, context]) => context === IMAGE_DECODE_LOG_CONTEXT && (fields as Record<string, unknown>).correlation_id === miss.fields.correlation_id)
		expect(decodes).toHaveLength(1)
		expect(decodes[0][2]).toMatchObject({ schema: 'acme', source: 'UPLOADED_MEDIA', path: miss.fields.path, input_format: 'png', input_bytes: miss.fields.input_bytes, resource_id: expect.any(String) })

		const hit = await lineFor(path)
		expect(event.mock.calls.some(([, , fields, context]) => context === IMAGE_DECODE_LOG_CONTEXT && (fields as Record<string, unknown>).correlation_id === hit.fields.correlation_id)).toBe(false)
		expect(hit.fields).toMatchObject({ cache: 'memory', outcome: 'ok', status: 200, output_bytes: miss.fields.output_bytes })
		expect(hit.fields.input_format).toBeUndefined()

		const first = await request(app.getHttpServer()).get(path)
		const conditional = await lineFor(path, { 'If-None-Match': first.headers.etag })
		expect(conditional.fields).toMatchObject({ status: 304, outcome: 'not_modified', cache: 'memory' })
	})

	it('rejects an SVG saved as .png on the SVG size limit, at WARN', async () => {
		const { level, fields, status } = await lineFor(route(`svg-as-png-${RUN}.png`))

		expect(status).toBe(200)
		expect(level).toBe('warn')
		expect(fields).toMatchObject({
			cache: 'miss',
			input_format: 'svg',
			input_bytes: bodies.get(`/media/acme/uploads/svg-as-png-${RUN}.png`)!.length,
			outcome: 'rejected',
			error: 'UpstreamResourceTooLargeError',
			output_format: 'webp',
		})
	})

	it('processes a PNG saved as .svg under the PNG limit', async () => {
		const { level, fields } = await lineFor(route(`png-as-svg-${RUN}.svg`))

		expect(level).toBe('log')
		expect(fields).toMatchObject({ input_format: 'png', outcome: 'ok', cache: 'miss' })
	})

	it('rejects a source in no accepted format, at WARN', async () => {
		const { level, fields } = await lineFor(route(`gzip-${RUN}.png`))

		expect(level).toBe('warn')
		expect(fields).toMatchObject({ outcome: 'rejected', error: 'UnsupportedSourceFormatError' })
		expect(fields.input_format).toBeUndefined()
	})

	it('logs the default image served for an upstream 404 as a fallback', async () => {
		const { level, fields, status } = await lineFor(route(`missing-${RUN}.png`))

		expect(status).toBe(200)
		expect(level).toBe('log')
		expect(fields).toMatchObject({ outcome: 'fallback', error: 'UnableToFetchResourceException', cache: 'miss', output_format: 'webp' })
	})

	it('logs a 400 and an unmatched route as invalid', async () => {
		const badWidth = await lineFor(`/media_stream-image/media/acme/uploads/ok-${RUN}.png/999999/64/contain/entropy/transparent/0/80.webp`)
		expect(badWidth.fields).toMatchObject({ status: 400, outcome: 'invalid', width: 999999, source: 'UPLOADED_MEDIA' })
		expect(badWidth.fields.error).toBeDefined()
		expect(badWidth.fields.cache).toBeUndefined()

		const unmatched = await lineFor('/media_stream-image/definitely/not/a/route')
		expect(unmatched.fields).toMatchObject({ status: 404, outcome: 'invalid', error: 'NotFoundException', path: 'definitely/not/a/route' })
		expect(unmatched.fields.source).toBeUndefined()
	})
})
