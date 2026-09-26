import type { ImageRequestLog } from '#microservice/Correlation/utils/image-request-log.util'
import type { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProcessingOverloadedError } from '#microservice/common/errors/media-stream.errors'
import { requestContextStorage } from '#microservice/Correlation/async-local-storage'
import { ProcessingAdmissionService } from '#microservice/Processing/services/processing-admission.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

function deferred<T>(): { promise: Promise<T>, resolve: (value: T) => void, reject: (error: Error) => void } {
	let resolve!: (value: T) => void
	let reject!: (error: Error) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

describe('processingAdmissionService', () => {
	let metrics: { setProcessingAdmission: ReturnType<typeof vi.fn>, recordProcessingRejected: ReturnType<typeof vi.fn> }

	function build(overrides: Record<string, unknown> = {}): ProcessingAdmissionService {
		return new ProcessingAdmissionService(
			createConfigServiceMock({ 'processing.cpuCores': 1, 'processing.maxConcurrent': 0, 'processing.maxQueue': 2, 'processing.queueTimeoutMs': 1000, ...overrides }),
			metrics as unknown as MetricsService,
		)
	}

	beforeEach(() => {
		vi.useFakeTimers()
		metrics = { setProcessingAdmission: vi.fn(), recordProcessingRejected: vi.fn() }
	})

	afterEach(() => {
		vi.useRealTimers()
	})

	it('derives the concurrency from cpuCores (ceil) when maxConcurrent is 0 and honours an explicit value', () => {
		expect(build({ 'processing.cpuCores': 1.5 }).stats.maxConcurrent).toBe(2)
		expect(build({ 'processing.cpuCores': 0.5 }).stats.maxConcurrent).toBe(1)
		expect(build({ 'processing.maxConcurrent': 3 }).stats.maxConcurrent).toBe(3)
	})

	it('runs up to maxConcurrent pipelines at once and queues the rest in order', async () => {
		const service = build()
		const first = deferred<string>()
		const second = deferred<string>()
		const order: string[] = []

		const p1 = service.run(async () => {
			order.push('start-1')
			return first.promise
		})
		const p2 = service.run(async () => {
			order.push('start-2')
			return second.promise
		})
		await Promise.resolve()

		expect(order).toEqual(['start-1'])
		expect(service.stats).toMatchObject({ inFlight: 1, queued: 1 })
		expect(metrics.setProcessingAdmission).toHaveBeenLastCalledWith(1, 1)

		first.resolve('one')
		await expect(p1).resolves.toBe('one')
		await Promise.resolve()
		expect(order).toEqual(['start-1', 'start-2'])
		expect(service.stats).toMatchObject({ inFlight: 1, queued: 0 })

		second.resolve('two')
		await expect(p2).resolves.toBe('two')
		expect(service.stats).toMatchObject({ inFlight: 0, queued: 0 })
	})

	it('releases the slot when the pipeline throws', async () => {
		const service = build()

		await expect(service.run(async () => {
			throw new Error('boom')
		})).rejects.toThrow('boom')

		expect(service.stats).toMatchObject({ inFlight: 0, queued: 0 })
	})

	it('rejects with ProcessingOverloadedError once the queue is full, without waiting', async () => {
		const service = build()
		const gate = deferred<void>()
		const running = service.run(() => gate.promise)
		const queued = [service.run(() => gate.promise), service.run(() => gate.promise)]

		await expect(service.run(async () => 'never')).rejects.toBeInstanceOf(ProcessingOverloadedError)
		expect(metrics.recordProcessingRejected).toHaveBeenCalledWith('queue_full')
		expect(service.stats).toMatchObject({ inFlight: 1, queued: 2 })

		gate.resolve()
		await Promise.all([running, ...queued])
		expect(service.stats).toMatchObject({ inFlight: 0, queued: 0 })
	})

	it('rejects a waiter that does not get a slot within queueTimeoutMs and drops it from the queue', async () => {
		const service = build()
		const gate = deferred<void>()
		const running = service.run(() => gate.promise)
		const waiter = service.run(async () => 'late')
		// Settle the rejection handler now; the assertion below runs after the clock moves.
		waiter.catch(() => undefined)
		expect(vi.getTimerCount()).toBe(1)

		await vi.advanceTimersByTimeAsync(1000)
		await expect(waiter).rejects.toBeInstanceOf(ProcessingOverloadedError)

		expect(metrics.recordProcessingRejected).toHaveBeenCalledWith('queue_timeout')
		expect(service.stats).toMatchObject({ inFlight: 1, queued: 0 })

		gate.resolve()
		await running
		expect(service.stats).toMatchObject({ inFlight: 0, queued: 0 })
	})

	it('carries Retry-After seconds on the rejection', async () => {
		const service = build({ 'processing.maxQueue': 0 })
		const gate = deferred<void>()
		const running = service.run(() => gate.promise)

		const error = await service.run(async () => 'x').catch((e: unknown) => e)
		expect(error).toBeInstanceOf(ProcessingOverloadedError)
		expect((error as ProcessingOverloadedError).retryAfterSeconds).toBeGreaterThan(0)
		expect((error as ProcessingOverloadedError).status).toBe(503)

		gate.resolve()
		await running
	})

	it('adds the time a request waited for a slot to its log record, granted or not', async () => {
		const service = build()
		const gate = deferred<void>()
		const running = service.run(() => gate.promise)
		const inRequest = <T>(log: ImageRequestLog, fn: () => Promise<T>): Promise<T> => requestContextStorage.run(
			{ correlationId: 'c', timestamp: 0, clientIp: '127.0.0.1', method: 'GET', url: '/', startTime: 0n, imageRequest: log },
			fn,
		)

		const granted: ImageRequestLog = { correlationId: 'c', startedAt: 0n, path: 'p', admissionWaitMs: 0 }
		const grantedRun = inRequest(granted, () => service.run(async () => 'ok'))
		await vi.advanceTimersByTimeAsync(400)
		gate.resolve()
		await Promise.all([running, grantedRun])
		expect(granted.admissionWaitMs).toBeGreaterThanOrEqual(400)

		const blocker = deferred<void>()
		const blocking = service.run(() => blocker.promise)
		const timedOut: ImageRequestLog = { correlationId: 'c', startedAt: 0n, path: 'p', admissionWaitMs: 0 }
		const shed = inRequest(timedOut, () => service.run(async () => 'late'))
		shed.catch(() => undefined)
		await vi.advanceTimersByTimeAsync(1000)
		await expect(shed).rejects.toBeInstanceOf(ProcessingOverloadedError)
		expect(timedOut.admissionWaitMs).toBeGreaterThanOrEqual(1000)

		blocker.resolve()
		await blocking
	})

	it('fails every waiter on shutdown so no request hangs', async () => {
		const service = build()
		const gate = deferred<void>()
		const running = service.run(() => gate.promise)
		const waiter = service.run(async () => 'x')

		service.onModuleDestroy()

		await expect(waiter).rejects.toBeInstanceOf(ProcessingOverloadedError)
		gate.resolve()
		await running
	})
})
