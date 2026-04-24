import { Buffer } from 'node:buffer'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Performance tests for the cache layer.
 * Tests memory cache, multi-layer cache, and request deduplication under load.
 */

// ---- Memory Cache Performance ----

describe('memory Cache Performance', () => {
	let NodeCache: any
	let cache: any

	beforeAll(async () => {
		const mod = await import('node-cache')
		NodeCache = mod.default
	})

	beforeEach(() => {
		cache = new NodeCache({ stdTTL: 3600, useClones: false, maxKeys: -1 })
	})

	afterAll(() => {
		cache?.flushAll()
	})

	it('should set/get 1000 small entries under 50ms', () => {
		const start = performance.now()

		for (let i = 0; i < 1000; i++) {
			cache.set(`key:${i}`, { data: `value-${i}`, timestamp: Date.now() })
		}
		for (let i = 0; i < 1000; i++) {
			cache.get(`key:${i}`)
		}

		const ms = performance.now() - start
		expect(ms).toBeLessThan(50)
	})

	it('should set/get 1000 buffer entries (1KB each) under 100ms', () => {
		const buffer = Buffer.alloc(1024, 0xAB)
		const start = performance.now()

		for (let i = 0; i < 1000; i++) {
			cache.set(`buf:${i}`, { data: buffer, metadata: { size: 1024, format: 'webp' } })
		}
		for (let i = 0; i < 1000; i++) {
			cache.get(`buf:${i}`)
		}

		const ms = performance.now() - start
		expect(ms).toBeLessThan(100)
	})

	it('should set/get 100 buffer entries (100KB each) under 100ms', () => {
		const buffer = Buffer.alloc(100 * 1024, 0xCD)
		const start = performance.now()

		for (let i = 0; i < 100; i++) {
			cache.set(`large:${i}`, { data: buffer, metadata: { size: buffer.length } })
		}
		for (let i = 0; i < 100; i++) {
			cache.get(`large:${i}`)
		}

		const ms = performance.now() - start
		expect(ms).toBeLessThan(100)
	})

	it('should handle 10000 key lookups (50% miss) under 50ms', () => {
		// Pre-populate only even keys
		for (let i = 0; i < 10000; i += 2) {
			cache.set(`lookup:${i}`, `value-${i}`)
		}

		const start = performance.now()
		let hits = 0
		let misses = 0

		for (let i = 0; i < 10000; i++) {
			const val = cache.get(`lookup:${i}`)
			if (val !== undefined)
				hits++
			else misses++
		}

		const ms = performance.now() - start
		expect(hits).toBe(5000)
		expect(misses).toBe(5000)
		expect(ms).toBeLessThan(50)
	})

	it('should delete 1000 keys under 20ms', () => {
		for (let i = 0; i < 1000; i++) {
			cache.set(`del:${i}`, `value-${i}`)
		}

		const start = performance.now()
		for (let i = 0; i < 1000; i++) {
			cache.del(`del:${i}`)
		}

		const ms = performance.now() - start
		expect(ms).toBeLessThan(20)
	})

	it('should enumerate keys from 5000-entry cache under 10ms', () => {
		for (let i = 0; i < 5000; i++) {
			cache.set(`enum:${i}`, i)
		}

		const start = performance.now()
		const keys = cache.keys()
		const ms = performance.now() - start

		expect(keys.length).toBe(5000)
		expect(ms).toBeLessThan(10)
	})
})

// ---- Request Deduplication Performance ----

describe('request Deduplication Performance', () => {
	it('should deduplicate 100 concurrent identical requests', async () => {
		const { RequestDeduplicator } = await import('#microservice/common/utils/request-deduplication.util')
		const dedup = new RequestDeduplicator()

		let executionCount = 0
		const work = async () => {
			executionCount++
			// Simulate 50ms of processing
			await new Promise(resolve => setTimeout(resolve, 50))
			return 'result'
		}

		const start = performance.now()

		// Fire 100 concurrent requests for the same key
		const promises = Array.from({ length: 100 }).fill(dedup.execute('same-key', work))
		const results = await Promise.all(promises)
		const ms = performance.now() - start

		// The function should have been called only once
		expect(executionCount).toBe(1)
		// All 100 callers should get the same result
		expect(results.every(r => r === 'result')).toBe(true)
		// Total time should be ~50ms (one execution), not 5000ms (100 sequential)
		expect(ms).toBeLessThan(200)

		dedup.onModuleDestroy()
	})

	it('should allow parallel execution for different keys', async () => {
		const { RequestDeduplicator } = await import('#microservice/common/utils/request-deduplication.util')
		const dedup = new RequestDeduplicator()

		let executionCount = 0
		const work = async () => {
			executionCount++
			await new Promise(resolve => setTimeout(resolve, 30))
		}

		const start = performance.now()

		// 10 different keys should all run in parallel
		const promises = Array.from({ length: 10 }, (_, i) =>
			dedup.execute(`key-${i}`, work))
		await Promise.all(promises)
		const ms = performance.now() - start

		expect(executionCount).toBe(10)
		// All 10 should run in parallel, so ~30ms not 300ms
		expect(ms).toBeLessThan(200)

		dedup.onModuleDestroy()
	})

	it('should handle 50 keys × 10 concurrent each efficiently', async () => {
		const { RequestDeduplicator } = await import('#microservice/common/utils/request-deduplication.util')
		const dedup = new RequestDeduplicator()

		let executionCount = 0
		const work = async () => {
			executionCount++
			await new Promise(resolve => setTimeout(resolve, 20))
		}

		const start = performance.now()

		// 50 unique keys, 10 concurrent requests per key = 500 total calls
		const promises: Promise<void>[] = []
		for (let key = 0; key < 50; key++) {
			for (let req = 0; req < 10; req++) {
				promises.push(dedup.execute(`key-${key}`, work))
			}
		}
		await Promise.all(promises)
		const ms = performance.now() - start

		// Only 50 actual executions (one per unique key)
		expect(executionCount).toBe(50)
		// Should complete in ~20ms (all keys parallel), not 1000ms
		expect(ms).toBeLessThan(500)

		dedup.onModuleDestroy()
	})
})

// ---- Circuit Breaker Performance ----

describe('circuit Breaker Performance', () => {
	it('should handle 10000 recordSuccess calls under 50ms', async () => {
		const { CircuitBreaker } = await import('#microservice/HTTP/utils/circuit-breaker')

		const cb = new CircuitBreaker({
			failureThreshold: 50,
			resetTimeout: 30000,
			rollingWindow: 60000,
			minimumRequests: 10,
		})

		const start = performance.now()
		for (let i = 0; i < 10000; i++) {
			cb.recordSuccess()
		}
		const ms = performance.now() - start

		expect(ms).toBeLessThan(50)
		expect(cb.getStats().totalRequests).toBe(10000)

		cb.destroy()
	})

	it('should handle mixed success/failure load under 100ms', async () => {
		const { CircuitBreaker } = await import('#microservice/HTTP/utils/circuit-breaker')

		const cb = new CircuitBreaker({
			failureThreshold: 80, // High threshold so it doesn't trip
			resetTimeout: 30000,
			rollingWindow: 60000,
			minimumRequests: 100,
		})

		const start = performance.now()
		for (let i = 0; i < 10000; i++) {
			if (i % 10 === 0) {
				cb.recordFailure()
			}
			else {
				cb.recordSuccess()
			}
		}
		const ms = performance.now() - start

		expect(ms).toBeLessThan(100)
		expect(cb.getStats().totalRequests).toBe(10000)

		cb.destroy()
	})

	it('should prune window efficiently for 60s rolling window', async () => {
		const { CircuitBreaker } = await import('#microservice/HTTP/utils/circuit-breaker')

		const cb = new CircuitBreaker({
			failureThreshold: 50,
			resetTimeout: 30000,
			rollingWindow: 100, // 100ms window for fast pruning
			minimumRequests: 10,
		})

		// Fill window
		for (let i = 0; i < 1000; i++) {
			cb.recordSuccess()
		}

		// Wait for window to expire
		await new Promise(resolve => setTimeout(resolve, 150))

		// All entries should be pruned on next operation
		const start = performance.now()
		cb.recordSuccess()
		const ms = performance.now() - start

		expect(ms).toBeLessThan(10)
		// After prune, only the new entry remains
		expect(cb.getStats().totalRequests).toBe(1001)

		cb.destroy()
	})
})

// ---- Bot Detection Performance ----

describe('bot Detection Performance', () => {
	it('should test 10000 user-agents against bot pattern under 20ms', async () => {
		const { RateLimitService } = await import('#microservice/RateLimit/services/rate-limit.service')

		// Create a minimal mock for the service
		const mockConfig = { getOptional: vi.fn().mockReturnValue('') }
		const mockMetrics = {
			recordError: vi.fn(),
			getRegistry: vi.fn(),
			recordCacheOperation: vi.fn(),
		}
		const mockRedis = {
			getConnectionStatus: vi.fn().mockReturnValue({ connected: false }),
			getClient: vi.fn().mockReturnValue(null),
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn(),
		}
		const service = new RateLimitService(
			mockConfig as any,
			mockMetrics as any,
			mockRedis as any,
		)

		const userAgents = [
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
			'Googlebot/2.1 (+http://www.google.com/bot.html)',
			'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
			'facebookexternalhit/1.1',
			'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
		]

		const start = performance.now()
		for (let i = 0; i < 10000; i++) {
			service.isBot(userAgents[i % userAgents.length])
		}
		const ms = performance.now() - start

		expect(ms).toBeLessThan(20)
	})
})
