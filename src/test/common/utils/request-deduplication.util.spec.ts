import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestDeduplicator } from '#microservice/common/utils/request-deduplication.util'

describe('requestDeduplicator', () => {
	let dedup: RequestDeduplicator<string>

	beforeEach(() => {
		dedup = new RequestDeduplicator<string>()
	})

	afterEach(() => {
		dedup.onModuleDestroy()
	})

	it('should execute the function once for concurrent identical keys', async () => {
		let calls = 0
		const work = async (): Promise<string> => {
			calls++
			await new Promise(resolve => setTimeout(resolve, 20))
			return 'result'
		}

		const results = await Promise.all([
			dedup.execute('key', work),
			dedup.execute('key', work),
			dedup.execute('key', work),
		])

		expect(calls).toBe(1)
		expect(results).toEqual(['result', 'result', 'result'])
	})

	it('should execute independently for different keys', async () => {
		let calls = 0
		const work = async (): Promise<string> => {
			calls++
			return 'r'
		}

		await Promise.all([dedup.execute('a', work), dedup.execute('b', work)])

		expect(calls).toBe(2)
	})

	it('should propagate rejections to all waiters and allow retry afterwards', async () => {
		let calls = 0
		const failing = async (): Promise<string> => {
			calls++
			throw new Error('boom')
		}

		const p1 = dedup.execute('key', failing)
		const p2 = dedup.execute('key', failing)
		await expect(p1).rejects.toThrow('boom')
		await expect(p2).rejects.toThrow('boom')
		expect(calls).toBe(1)

		// Failure entries are removed immediately — a later call retries
		await expect(dedup.execute('key', async () => 'recovered')).resolves.toBe('recovered')
	})

	it('should stop its cleanup interval on destroy', () => {
		const clearSpy = vi.spyOn(globalThis, 'clearInterval')
		dedup.onModuleDestroy()
		expect(clearSpy).toHaveBeenCalled()
		clearSpy.mockRestore()
	})
})
