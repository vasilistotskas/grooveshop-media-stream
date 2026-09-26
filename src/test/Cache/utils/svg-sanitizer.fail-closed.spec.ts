import type { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sanitizeSvg, SVG_SANITIZER_HEAP_LIMIT_MB } from '#microservice/Cache/utils/svg-sanitizer.util'

// Isolated in its own file so the worker_threads mock doesn't affect the
// real-worker behavioural spec. Each test scripts what the fake worker does.
const { workers, reply } = vi.hoisted(() => ({
	workers: [] as Array<{ options: any, terminate: ReturnType<typeof vi.fn> }>,
	reply: { current: (_worker: EventEmitter): void => {} },
}))

vi.mock('node:worker_threads', async () => {
	const { EventEmitter: Emitter } = await import('node:events')
	class FakeWorker extends Emitter {
		readonly terminate = vi.fn(async () => 1)
		constructor(_url: URL, readonly options: any) {
			super()
			workers.push(this)
			setImmediate(() => reply.current(this))
		}
	}
	return { Worker: FakeWorker }
})

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"/>'

describe('sanitizeSvg — fail closed', () => {
	afterEach(() => {
		workers.length = 0
	})

	it('hands the markup to a worker with a capped heap', async () => {
		reply.current = worker => worker.emit('message', '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')

		await expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>', { timeoutMs: 1000 }))
			.resolves
			.toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')
		expect(workers[0].options).toMatchObject({
			workerData: '<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>',
			resourceLimits: { maxOldGenerationSizeMb: SVG_SANITIZER_HEAP_LIMIT_MB },
		})
	})

	it('rejects the SVG when the worker runs out of heap', async () => {
		reply.current = worker => worker.emit('error', Object.assign(new Error('Worker terminated due to reaching memory limit: JS heap out of memory'), { code: 'ERR_WORKER_OUT_OF_MEMORY' }))

		await expect(sanitizeSvg(SVG, { timeoutMs: 1000 })).rejects.toThrow('SVG sanitization unavailable')
	})

	it('rejects the SVG when the worker exits without replying', async () => {
		reply.current = worker => worker.emit('exit', 1)

		await expect(sanitizeSvg(SVG, { timeoutMs: 1000 })).rejects.toThrow('SVG sanitization unavailable')
	})

	it('rejects the SVG when a <script element survives sanitization (tripwire)', async () => {
		// Simulate a DOMPurify misconfiguration/regression that lets a script through.
		reply.current = worker => worker.emit('message', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

		await expect(sanitizeSvg(SVG, { timeoutMs: 1000 })).rejects.toThrow('SVG sanitization incomplete')
	})

	it('terminates a worker that outlives the budget', async () => {
		reply.current = () => {}

		await expect(sanitizeSvg(SVG, { timeoutMs: 5 })).rejects.toMatchObject({ code: 'PROCESSING_TIMEOUT' })
		expect(workers[0].terminate).toHaveBeenCalled()
	})
})
