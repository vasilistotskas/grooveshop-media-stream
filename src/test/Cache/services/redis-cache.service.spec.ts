import type { MockedObject } from 'vitest'
import type { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Buffer } from 'node:buffer'
import { Redis } from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

interface MockRedis {
	status: string
	connect: ReturnType<typeof vi.fn>
	quit: ReturnType<typeof vi.fn>
	getBuffer: ReturnType<typeof vi.fn>
	set: ReturnType<typeof vi.fn>
	del: ReturnType<typeof vi.fn>
	exists: ReturnType<typeof vi.fn>
	scan: ReturnType<typeof vi.fn>
	ping: ReturnType<typeof vi.fn>
	ttl: ReturnType<typeof vi.fn>
	info: ReturnType<typeof vi.fn>
	on: ReturnType<typeof vi.fn>
}

vi.mock('ioredis', () => {
	const mockConstructor = vi.fn(function (this: Record<string, unknown>) {
		const instance: MockRedis = {
			status: 'wait',
			connect: vi.fn().mockImplementation(function (this: MockRedis) {
				this.status = 'ready'
				return Promise.resolve()
			}),
			quit: vi.fn().mockResolvedValue('OK'),
			getBuffer: vi.fn(),
			set: vi.fn().mockResolvedValue('OK'),
			del: vi.fn().mockResolvedValue(1),
			exists: vi.fn(),
			scan: vi.fn().mockResolvedValue(['0', []]),
			ping: vi.fn().mockResolvedValue('PONG'),
			ttl: vi.fn().mockResolvedValue(3600),
			info: vi.fn(),
			on: vi.fn(),
		}
		Object.assign(this, instance)
		return instance
	})

	return { default: mockConstructor, Redis: mockConstructor }
})

const REDIS_CONFIG = {
	host: 'redis.local',
	port: 6380,
	password: undefined,
	db: 2,
	ttl: 7200,
	maxRetries: 3,
	healthCheckCacheTtl: 10000,
}

describe('redisCacheService', () => {
	let service: RedisCacheService
	let metricsService: MockedObject<MetricsService>
	let redis: MockRedis

	async function createService(overrides: Record<string, unknown> = {}): Promise<RedisCacheService> {
		const created = new RedisCacheService(
			createConfigServiceMock({ 'cache.redis': { ...REDIS_CONFIG, ...overrides } }),
			metricsService,
		)
		await created.onModuleInit()
		redis = vi.mocked(Redis).mock.results.at(-1)!.value as MockRedis
		return created
	}

	beforeEach(async () => {
		vi.clearAllMocks()
		metricsService = {
			updateActiveConnections: vi.fn(),
			updateCacheHitRatio: vi.fn(),
		} as unknown as MockedObject<MetricsService>
		service = await createService()
	})

	afterEach(() => {
		vi.unstubAllEnvs()
	})

	describe('initialization', () => {
		it('should construct the client from cache.redis and connect once', () => {
			expect(Redis).toHaveBeenCalledWith(expect.objectContaining({
				host: 'redis.local',
				port: 6380,
				db: 2,
				maxRetriesPerRequest: 3,
				lazyConnect: true,
				retryStrategy: expect.any(Function),
			}))
			expect(redis.connect).toHaveBeenCalledOnce()
			expect(service.isConnected).toBe(true)
		})

		it('should back off exponentially up to 30 seconds between reconnects', () => {
			const [options] = vi.mocked(Redis).mock.calls[0] as unknown as [{ retryStrategy: (times: number) => number }]
			const { retryStrategy } = options

			expect(retryStrategy(1)).toBe(2000)
			expect(retryStrategy(3)).toBe(8000)
			expect(retryStrategy(10)).toBe(30000)
		})

		it('should register ready, error and close listeners', () => {
			const events = redis.on.mock.calls.map(([event]) => event)

			expect(events).toEqual(['ready', 'error', 'close'])
		})

		it('should report connections through the metrics gauge', () => {
			const ready = redis.on.mock.calls.find(([event]) => event === 'ready')![1] as () => void
			const close = redis.on.mock.calls.find(([event]) => event === 'close')![1] as () => void

			ready()
			expect(metricsService.updateActiveConnections).toHaveBeenCalledWith('redis', 1)
			close()
			expect(metricsService.updateActiveConnections).toHaveBeenCalledWith('redis', 0)
		})

		it('should resolve onModuleInit when the initial connect fails and let ioredis retry', async () => {
			const constructorMock = vi.mocked(Redis) as unknown as { mockImplementationOnce: (fn: () => unknown) => void }
			constructorMock.mockImplementationOnce(function (this: Record<string, unknown>) {
				const instance = {
					status: 'reconnecting',
					connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
					on: vi.fn(),
				}
				Object.assign(this, instance)
				return instance
			})

			const offline = new RedisCacheService(createConfigServiceMock({ 'cache.redis': REDIS_CONFIG }), metricsService)
			await expect(offline.onModuleInit()).resolves.toBeUndefined()

			const instance = vi.mocked(Redis).mock.results.at(-1)!.value as MockRedis
			expect(instance.connect).toHaveBeenCalledOnce()
			expect(offline.isConnected).toBe(false)
			expect(offline.getClient()).toBeNull()
		})

		it('should refuse to start in production without a password', async () => {
			vi.stubEnv('NODE_ENV', 'production')
			const unprotected = new RedisCacheService(createConfigServiceMock({ 'cache.redis': REDIS_CONFIG }), metricsService)

			await expect(unprotected.onModuleInit()).rejects.toThrow('REDIS_PASSWORD is required in production')
		})

		it('should quit the client on module destroy', async () => {
			await service.onModuleDestroy()

			expect(redis.quit).toHaveBeenCalledOnce()
		})
	})

	describe('get', () => {
		it('should parse JSON values', async () => {
			redis.getBuffer.mockResolvedValue(Buffer.from(JSON.stringify({ hello: 'world' })))

			await expect(service.get('key')).resolves.toEqual({ hello: 'world' })
			expect(redis.getBuffer).toHaveBeenCalledWith('key')
		})

		it('should return null for a missing key', async () => {
			redis.getBuffer.mockResolvedValue(null)

			await expect(service.get('missing')).resolves.toBeNull()
		})

		it('should decode the binary envelope without copying the payload', async () => {
			const meta = Buffer.from(JSON.stringify({ metadata: { format: 'webp' } }), 'utf8')
			const image = Buffer.from([1, 2, 3, 4])
			const header = Buffer.alloc(5)
			header[0] = 0x00
			header.writeUInt32BE(meta.length, 1)
			const stored = Buffer.concat([header, meta, image])
			redis.getBuffer.mockResolvedValue(stored)

			const value = await service.get<{ data: Buffer, metadata: { format: string } }>('image:acme:x')

			expect(value?.metadata).toEqual({ format: 'webp' })
			expect(Buffer.isBuffer(value?.data)).toBe(true)
			expect(value?.data.equals(image)).toBe(true)
			expect(value?.data.buffer).toBe(stored.buffer)
		})

		it('should return null for an undecodable value', async () => {
			redis.getBuffer.mockResolvedValue(Buffer.from('not json'))

			await expect(service.get('key')).resolves.toBeNull()
		})

		it('should propagate command errors and count them', async () => {
			redis.getBuffer.mockRejectedValue(new Error('READONLY'))

			await expect(service.get('key')).rejects.toThrow('READONLY')
			expect(service.getConnectionStatus().stats.errors).toBe(1)
		})

		it('should be a miss while disconnected', async () => {
			redis.status = 'reconnecting'

			await expect(service.get('key')).resolves.toBeNull()
			expect(redis.getBuffer).not.toHaveBeenCalled()
		})
	})

	describe('set', () => {
		it('should write with the given TTL in seconds', async () => {
			await service.set('key', { a: 1 }, 60)

			expect(redis.set).toHaveBeenCalledWith('key', Buffer.from(JSON.stringify({ a: 1 })), 'EX', 60)
		})

		it.each([undefined, 0])('should fall back to cache.redis.ttl when ttl is %s', async (ttl) => {
			await service.set('key', 'value', ttl)

			expect(redis.set).toHaveBeenCalledWith('key', expect.any(Buffer), 'EX', 7200)
		})

		it('should use the binary envelope for values carrying a Buffer', async () => {
			const data = Buffer.from([9, 8, 7])
			await service.set('image:acme:x', { data, metadata: { format: 'png' } }, 30)

			const stored = redis.set.mock.calls[0][1] as Buffer
			expect(stored[0]).toBe(0x00)
			const metaLength = stored.readUInt32BE(1)
			expect(JSON.parse(stored.toString('utf8', 5, 5 + metaLength))).toEqual({ metadata: { format: 'png' } })
			expect(stored.subarray(5 + metaLength).equals(data)).toBe(true)
		})

		it('should propagate command errors', async () => {
			redis.set.mockRejectedValue(new Error('OOM'))

			await expect(service.set('key', 'value', 10)).rejects.toThrow('OOM')
		})

		it('should skip the write while disconnected', async () => {
			redis.status = 'connecting'

			await service.set('key', 'value', 10)

			expect(redis.set).not.toHaveBeenCalled()
		})
	})

	describe('delete', () => {
		it('should delete the key', async () => {
			await service.delete('key')

			expect(redis.del).toHaveBeenCalledWith('key')
		})

		it('should propagate command errors', async () => {
			redis.del.mockRejectedValue(new Error('down'))

			await expect(service.delete('key')).rejects.toThrow('down')
		})

		it('should skip the delete while disconnected', async () => {
			redis.status = 'end'

			await service.delete('key')

			expect(redis.del).not.toHaveBeenCalled()
		})
	})

	describe('clear', () => {
		it('should SCAN image keys and DEL each batch', async () => {
			redis.scan
				.mockResolvedValueOnce(['5', ['image:acme:a', 'image:acme:b']])
				.mockResolvedValueOnce(['0', ['image:public:c']])

			await service.clear()

			expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'image:*', 'COUNT', 100)
			expect(redis.del).toHaveBeenCalledWith('image:acme:a', 'image:acme:b')
			expect(redis.del).toHaveBeenCalledWith('image:public:c')
		})

		it('should not DEL when the scan is empty', async () => {
			await service.clear()

			expect(redis.del).not.toHaveBeenCalled()
		})

		it('should propagate command errors', async () => {
			redis.scan.mockRejectedValue(new Error('scan failed'))

			await expect(service.clear()).rejects.toThrow('scan failed')
		})
	})

	describe('has', () => {
		it('should reflect EXISTS', async () => {
			redis.exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0)

			await expect(service.has('a')).resolves.toBe(true)
			await expect(service.has('b')).resolves.toBe(false)
		})

		it('should return false on command errors', async () => {
			redis.exists.mockRejectedValue(new Error('down'))

			await expect(service.has('a')).resolves.toBe(false)
		})
	})

	describe('getStats', () => {
		it('should read the key count of the configured database only', async () => {
			redis.info
				.mockResolvedValueOnce('# Keyspace\r\ndb0:keys=999,expires=0\r\ndb2:keys=42,expires=1\r\n')
				.mockResolvedValueOnce('used_memory:2048\r\n')
			redis.getBuffer.mockResolvedValueOnce(Buffer.from('"x"')).mockResolvedValueOnce(null)
			await service.get('hit')
			await service.get('miss')

			const stats = await service.getStats()

			expect(stats).toEqual({ hits: 1, misses: 1, keys: 42, ksize: 0, vsize: 2048, hitRate: 0.5 })
			expect(metricsService.updateCacheHitRatio).toHaveBeenCalledWith('redis', 0.5)
		})

		it('should tolerate INFO failures', async () => {
			redis.info.mockRejectedValue(new Error('INFO disabled'))

			const stats = await service.getStats()

			expect(stats.keys).toBe(0)
			expect(stats.vsize).toBe(0)
		})
	})

	describe('connection helpers', () => {
		it('should ping when connected and throw otherwise', async () => {
			await expect(service.ping()).resolves.toBe('PONG')

			redis.status = 'reconnecting'
			await expect(service.ping()).rejects.toThrow('Redis not connected')
		})

		it('should report TTL, -1 when disconnected', async () => {
			await expect(service.getTtl('key')).resolves.toBe(3600)

			redis.status = 'reconnecting'
			await expect(service.getTtl('key')).resolves.toBe(-1)
		})

		it('should expose the raw client only while ready', () => {
			expect(service.getClient()).toBe(redis)

			redis.status = 'close'
			expect(service.getClient()).toBeNull()
		})

		it('should snapshot connection status and counters', async () => {
			redis.getBuffer.mockResolvedValue(null)
			await service.get('a')

			expect(service.getConnectionStatus()).toEqual({
				connected: true,
				stats: { hits: 0, misses: 1, operations: 1, errors: 0 },
			})
		})

		it('should parse memory usage and return zeros while disconnected', async () => {
			redis.info.mockResolvedValue('used_memory:1000\r\nused_memory_peak:1500\r\nmem_fragmentation_ratio:1.25\r\n')

			await expect(service.getMemoryUsage()).resolves.toEqual({ used: 1000, peak: 1500, fragmentation: 1.25 })

			redis.status = 'reconnecting'
			await expect(service.getMemoryUsage()).resolves.toEqual({ used: 0, peak: 0, fragmentation: 0 })
		})
	})
})
