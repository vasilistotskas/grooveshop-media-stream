import type { INestApplication } from '@nestjs/common'
import type { Server } from 'node:http'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import * as process from 'node:process'
import { Test, TestingModule } from '@nestjs/testing'
import sharp from 'sharp'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import MediaStreamModule from '#microservice/media-stream.module'

/**
 * End-to-end coverage for the core image-streaming endpoint.
 *
 * A local HTTP fixture server plays the upstream backend (BACKEND_URL points
 * at it), so the test runs offline: fetch -> Sharp processing -> multi-layer
 * cache -> streaming all execute against real implementations (Redis
 * required, as for the rest of the suite).
 */

// Generated in beforeAll: a noisy 100x100 PNG. The image must be non-uniform
// and larger than a few pixels because the route applies Sharp trim(), which
// rejects tiny/uniform images.
let pngFixture: Buffer

function IMAGE_ROUTE(name: string): string {
	return `/media_stream-image/media/uploads/${name}/64/64/contain/entropy/transparent/5/80.webp`
}

describe('image streaming (e2e)', () => {
	let app: INestApplication
	let moduleFixture: TestingModule
	let upstream: Server
	let upstreamRequests: string[]

	beforeAll(async () => {
		process.env.DISABLE_CRON = 'true'

		const noise = Buffer.alloc(100 * 100 * 3)
		for (let i = 0; i < noise.length; i++) {
			noise[i] = (i * 2654435761) % 256
		}
		pngFixture = await sharp(noise, { raw: { width: 100, height: 100, channels: 3 } })
			.png()
			.toBuffer()

		upstreamRequests = []
		upstream = createServer((req, res) => {
			upstreamRequests.push(req.url || '')
			if (req.url?.startsWith('/media/uploads/e2e-test-image')) {
				res.writeHead(200, {
					'Content-Type': 'image/png',
					'Content-Length': pngFixture.length,
				})
				res.end(pngFixture)
				return
			}
			res.writeHead(404)
			res.end('not found')
		})
		await new Promise<void>(resolve => upstream.listen(0, '127.0.0.1', resolve))
		const address = upstream.address()
		if (typeof address === 'object' && address) {
			// The default validation.allowedDomains list includes 127.0.0.1
			process.env.BACKEND_URL = `http://127.0.0.1:${address.port}`
		}

		moduleFixture = await Test.createTestingModule({
			imports: [MediaStreamModule],
		}).compile()

		app = moduleFixture.createNestApplication()
		await app.init()
	})

	afterAll(async () => {
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
		delete process.env.BACKEND_URL
		// Give async operations (Redis disconnect, scheduled tasks) time to settle
		await new Promise(resolve => setTimeout(resolve, 1000))
	})

	it('serves a processed image with caching headers', async () => {
		const uniqueName = `e2e-test-image-${process.pid}-headers.png`
		const response = await request(app.getHttpServer())
			.get(IMAGE_ROUTE(uniqueName))
			.expect(200)

		expect(response.headers['content-type']).toBe('image/webp')
		expect(response.headers.etag).toMatch(/^W\//)
		expect(response.headers['cache-control']).toContain('immutable')
		expect(response.headers['x-correlation-id']).toBeDefined()
		expect(response.body.length).toBeGreaterThan(0)
	})

	it('serves the second request from cache without refetching upstream', async () => {
		const uniqueName = `e2e-test-image-${process.pid}-cached.png`

		await request(app.getHttpServer()).get(IMAGE_ROUTE(uniqueName)).expect(200)
		const upstreamCallsAfterFirst = upstreamRequests.filter(u => u.includes(uniqueName)).length

		await request(app.getHttpServer()).get(IMAGE_ROUTE(uniqueName)).expect(200)
		const upstreamCallsAfterSecond = upstreamRequests.filter(u => u.includes(uniqueName)).length

		expect(upstreamCallsAfterFirst).toBe(1)
		expect(upstreamCallsAfterSecond).toBe(1)
	})

	it('answers 304 for a matching If-None-Match on a cached resource', async () => {
		const uniqueName = `e2e-test-image-${process.pid}-etag.png`

		const first = await request(app.getHttpServer()).get(IMAGE_ROUTE(uniqueName)).expect(200)
		const etag = first.headers.etag
		expect(etag).toBeDefined()

		await request(app.getHttpServer())
			.get(IMAGE_ROUTE(uniqueName))
			.set('If-None-Match', etag)
			.expect(304)
	})

	// eslint-disable-next-line test/expect-expect
	it('rejects out-of-range dimensions with 400', async () => {
		await request(app.getHttpServer())
			.get(`/media_stream-image/media/uploads/e2e-test-image.png/999999/64/contain/entropy/transparent/5/80.webp`)
			.expect(400)
	})

	// eslint-disable-next-line test/expect-expect
	it('returns 404 for a path matching no image source', async () => {
		await request(app.getHttpServer())
			.get('/media_stream-image/definitely/not/a/real/route')
			.expect(404)
	})

	it('serves the fallback image when the upstream 404s', async () => {
		const response = await request(app.getHttpServer())
			.get(IMAGE_ROUTE('missing-upstream-image.png').replace('e2e-test-image', 'missing'))
			.expect(200)

		// Fallback path serves the processed default image
		expect(response.headers['content-type']).toMatch(/^image\//)
		expect(response.body.length).toBeGreaterThan(0)
	})
})
