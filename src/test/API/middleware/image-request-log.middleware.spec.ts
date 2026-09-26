import type { ImageRequestLog } from '#microservice/Correlation/utils/image-request-log.util'
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_REQUEST_LOG_CONTEXT, ImageRequestLogMiddleware } from '#microservice/API/middleware/image-request-log.middleware'
import { requestContextStorage } from '#microservice/Correlation/async-local-storage'
import { currentImageRequest } from '#microservice/Correlation/utils/image-request-log.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

/** Every key the line may carry; anything else (a header, a query string) would be a leak. */
const FIELD_NAMES = [
	'correlation_id',
	'schema',
	'source',
	'path',
	'width',
	'height',
	'fit',
	'position',
	'format',
	'quality',
	'cache',
	'coalesced',
	'input_format',
	'input_bytes',
	'output_format',
	'output_bytes',
	'admission_wait_ms',
	'duration_ms',
	'status',
	'outcome',
	'error',
]

function fakeResponse(): EventEmitter & { statusCode: number, writableFinished: boolean } {
	return Object.assign(new EventEmitter(), { statusCode: 200, writableFinished: true })
}

function fakeRequest(originalUrl: string): any {
	return {
		originalUrl,
		headers: { 'authorization': 'Bearer secret', 'cookie': 'session=secret', 'user-agent': 'test' },
	}
}

describe('imageRequestLogMiddleware', () => {
	let middleware: ImageRequestLogMiddleware
	let metrics: { recordImageRequest: ReturnType<typeof vi.fn> }
	let event: ReturnType<typeof vi.spyOn>

	/**
	 * Run the middleware for one request inside a correlation context, let
	 * `pipeline` fill the record the way the image path would, then close
	 * the response. Returns the level, message and fields of the one line.
	 */
	function handle(url: string, pipeline: (log: ImageRequestLog, res: ReturnType<typeof fakeResponse>) => void): { level: string, message: string, fields: Record<string, unknown> } {
		const res = fakeResponse()
		requestContextStorage.run(
			{ correlationId: 'corr-1', timestamp: 0, clientIp: '127.0.0.1', method: 'GET', url, startTime: 0n },
			() => {
				middleware.use(fakeRequest(url), res as any, () => {
					pipeline(currentImageRequest() as ImageRequestLog, res)
				})
			},
		)
		res.emit('close')
		expect(event).toHaveBeenCalledTimes(1)
		const [level, message, fields, context] = event.mock.calls[0]
		expect(context).toBe(IMAGE_REQUEST_LOG_CONTEXT)
		return { level, message, fields }
	}

	beforeEach(() => {
		metrics = { recordImageRequest: vi.fn() }
		middleware = new ImageRequestLogMiddleware(metrics as any)
		event = vi.spyOn(CorrelatedLogger, 'event').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('emits one info line with every field of a served miss, and one metrics sample', () => {
		const { level, message, fields } = handle('/media_stream-image/media/webside/uploads/products/a.png/640/480/cover/centre/transparent/0/80.avif?utm=x', (log) => {
			Object.assign(log, {
				source: 'UPLOADED_MEDIA',
				schema: 'webside',
				width: 640,
				height: 480,
				fit: 'cover',
				position: 'centre',
				format: 'avif',
				quality: 80,
				cache: 'miss',
				inputFormat: 'png',
				inputBytes: 812_345,
				outputFormat: 'avif',
				outputBytes: 23_456,
				admissionWaitMs: 12.4,
				outcome: 'ok',
			})
		})

		expect(level).toBe('log')
		expect(message).toMatch(/^image ok 200 \d+ms$/)
		expect(fields).toEqual({
			correlation_id: 'corr-1',
			schema: 'webside',
			source: 'UPLOADED_MEDIA',
			path: 'media/webside/uploads/products/a.png/640/480/cover/centre/transparent/0/80.avif',
			width: 640,
			height: 480,
			fit: 'cover',
			position: 'centre',
			format: 'avif',
			quality: 80,
			cache: 'miss',
			coalesced: undefined,
			input_format: 'png',
			input_bytes: 812_345,
			output_format: 'avif',
			output_bytes: 23_456,
			admission_wait_ms: 12,
			duration_ms: expect.any(Number),
			status: 200,
			outcome: 'ok',
			error: undefined,
		})
		expect(metrics.recordImageRequest).toHaveBeenCalledWith('ok', 'avif', 'miss', expect.any(Number))
	})

	it('never carries request headers or the query string', () => {
		const { fields } = handle('/media_stream-image/static/images/logo.png/0/0/contain/centre/transparent/0/80.webp?token=secret', () => {})

		expect(Object.keys(fields).sort()).toEqual([...FIELD_NAMES].sort())
		expect(JSON.stringify(fields)).not.toMatch(/secret|Bearer|session/)
	})

	it('logs a rejected source at WARN with the same fields', () => {
		const { level, fields } = handle('/media_stream-image/media/webside/uploads/x.png/1/1/contain/centre/transparent/0/80.webp', (log) => {
			Object.assign(log, { cache: 'miss', inputFormat: 'svg', inputBytes: 3_000_000, outcome: 'rejected', error: 'UpstreamResourceTooLargeError' })
		})

		expect(level).toBe('warn')
		expect(fields).toMatchObject({ outcome: 'rejected', error: 'UpstreamResourceTooLargeError', input_format: 'svg', input_bytes: 3_000_000, status: 200 })
	})

	it('keeps the outcome the exception filter set for a capacity error', () => {
		const { level, fields } = handle('/media_stream-image/media/webside/uploads/x.png/1/1/contain/centre/transparent/0/80.webp', (log, res) => {
			Object.assign(log, { cache: 'miss', admissionWaitMs: 5000, outcome: 'overloaded', error: 'ProcessingOverloadedError' })
			res.statusCode = 503
		})

		expect(level).toBe('log')
		expect(fields).toMatchObject({ status: 503, outcome: 'overloaded', error: 'ProcessingOverloadedError', admission_wait_ms: 5000 })
		expect(metrics.recordImageRequest).toHaveBeenCalledWith('overloaded', 'none', 'miss', expect.any(Number))
	})

	it.each([
		[400, 'invalid'],
		[404, 'invalid'],
		[429, 'rate_limited'],
		[500, 'error'],
	])('derives the outcome of an unclassified %i from the status', (status, outcome) => {
		const { fields } = handle('/media_stream-image/nowhere', (_log, res) => {
			res.statusCode = status
		})

		expect(fields).toMatchObject({ status, outcome, path: 'nowhere' })
		expect(metrics.recordImageRequest).toHaveBeenCalledWith(outcome, 'none', 'none', expect.any(Number))
	})

	it('labels an invalid requested format as none', () => {
		handle('/media_stream-image/media/webside/uploads/x.png/1/1/contain/centre/transparent/0/80.exe', (log, res) => {
			Object.assign(log, { format: 'exe' })
			res.statusCode = 400
		})

		expect(metrics.recordImageRequest).toHaveBeenCalledWith('invalid', 'none', 'none', expect.any(Number))
	})

	it('reports a response the client abandoned as aborted', () => {
		const { fields } = handle('/media_stream-image/media/webside/uploads/x.png/1/1/contain/centre/transparent/0/80.webp', (log, res) => {
			Object.assign(log, { cache: 'miss' })
			res.writableFinished = false
		})

		expect(fields.outcome).toBe('aborted')
	})
})
