import type { MockedObject } from 'vitest'
import { Buffer } from 'node:buffer'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'
import Redis from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock ioredis
vi.mock('ioredis', () => {
	const mockConstructor = vi.fn(function (this: any) {
		// Create a new instance for each call
		const instance = {
			connect: vi.fn().mockResolvedValue(undefined),
			quit: vi.fn().mockResolvedValue('OK'),
			get: vi.fn(),
			getBuffer: vi.fn(),
			set: vi.fn().mockResolvedValue('OK'),
			setex: vi.fn().mockResolvedValue('OK'),
			del: vi.fn().mockResolvedValue(1),
			flushdb: vi.fn().mockResolvedValue('OK'),
			flushall: vi.fn().mockResolvedValue('OK'),
			exists: vi.fn(),
			keys: vi.fn().mockResolvedValue(['key1', 'key2']),
			scan: vi.fn().mockResolvedValue(['0', []]),
			ping: vi.fn().mockResolvedValue('PONG'),
			ttl: vi.fn().mockResolvedValue(3600),
			expire: vi.fn().mockResolvedValue(1),
			info: vi.fn(),
			on: vi.fn(),
		}
		// Store the instance on 'this' for constructor calls
		Object.assign(this, instance)
		return instance
	})

	return {
		default: mockConstructor,
		Redis: mockConstructor,
	}
})

describe('redisCacheService', () => {
	let service: RedisCacheService
	let metricsService: MockedObject<MetricsService>
	let mockRedis: MockedObject<Redis>

	const mockConfig = {
		host: 'localhost',
		port: 6379,
		password: undefined,
		db: 0,
		ttl: 7200,
		maxRetries: 3,
		retryDelayOnFailover: 100,
	}

	beforeEach(async () => {
		// Reset all mock function calls
		vi.clearAllMocks()

		const mockConfigService = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'cache.redis')
					return mockConfig
				if (key === 'cache.redis.ttl')
					return mockConfig.ttl
				return undefined
			}),
		}

		const mockMetricsService = {
			recordCacheOperation: vi.fn(),
			updateCacheHitRatio: vi.fn(),
			updateActiveConnections: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RedisCacheService,
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: MetricsService, useValue: mockMetricsService },
			],
		}).compile()

		service = module.get<RedisCacheService>(RedisCacheService)
		metricsService = module.get(MetricsService)

		// Get the mock Redis instance from the mocked Redis constructor
		// Redis is the mocked constructor, we can get its instances
		const RedisMock = Redis as any
		if (RedisMock.mock && RedisMock.mock.instances.length > 0) {
			mockRedis = RedisMock.mock.instances.at(-1)
		}
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('initialization', () => {
		it('should be defined', () => {
			expect(service).toBeDefined()
		})

		it('should initialize Redis connection on module init', async () => {
			await service.onModuleInit()

			// Update mockRedis to the latest instance
			const RedisMock = Redis as any
			if (RedisMock.mock && RedisMock.mock.instances.length > 0) {
				mockRedis = RedisMock.mock.instances.at(-1)
			}

			expect(Redis).toHaveBeenCalledWith({
				host: mockConfig.host,
				port: mockConfig.port,
				password: mockConfig.password,
				db: mockConfig.db,
				maxRetriesPerRequest: mockConfig.maxRetries,
				enableReadyCheck: true,
				lazyConnect: true,
				keepAlive: 30000,
				connectTimeout: 10000,
				commandTimeout: 5000,
			})
			expect(mockRedis.connect).toHaveBeenCalled()
		})

		it('should set up event listeners', async () => {
			await service.onModuleInit()

			// Update mockRedis to the latest instance
			const RedisMock = Redis as any
			if (RedisMock.mock && RedisMock.mock.instances.length > 0) {
				mockRedis = RedisMock.mock.instances.at(-1)
			}

			expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function))
			expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function))
			expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function))
			expect(mockRedis.on).toHaveBeenCalledWith('close', expect.any(Function))
			expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', expect.any(Function))
		})

		it('should close Redis connection on module destroy', async () => {
			await service.onModuleInit()

			// Update mockRedis to the latest instance
			const RedisMock = Redis as any
			if (RedisMock.mock && RedisMock.mock.instances.length > 0) {
				mockRedis = RedisMock.mock.instances.at(-1)
			}

			await service.onModuleDestroy()

			expect(mockRedis.quit).toHaveBeenCalled()
		})
	})

	describe('cache operations', () => {
		beforeEach(async () => {
			await service.onModuleInit()

			// Update mockRedis to the latest instance after onModuleInit
			const RedisMock = Redis as any
			if (RedisMock.mock && RedisMock.mock.instances.length > 0) {
				mockRedis = RedisMock.mock.instances.at(-1)
			}

			// Simulate ready event
			const readyCallback = mockRedis.on.mock.calls.find(call => call[0] === 'ready')?.[1]
			if (readyCallback)
				readyCallback()
		})

		describe('get', () => {
			it('should get value from Redis and parse JSON', async () => {
				const testValue = { test: 'data', number: 42 }
				mockRedis.getBuffer.mockResolvedValue(Buffer.from(JSON.stringify(testValue)))

				const result = await service.get<typeof testValue>('test-key')

				expect(mockRedis.getBuffer).toHaveBeenCalledWith('test-key')
				expect(result).toEqual(testValue)
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'redis', 'hit')
			})

			it('should return null when key does not exist', async () => {
				mockRedis.getBuffer.mockResolvedValue(null)

				const result = await service.get('non-existent-key')

				expect(result).toBeNull()
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'redis', 'miss')
			})

			it('should handle Redis errors gracefully', async () => {
				mockRedis.getBuffer.mockRejectedValue(new Error('Redis connection failed'))

				const result = await service.get('test-key')

				expect(result).toBeNull()
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'redis', 'error')
			})

			it('should return null when Redis is not connected', async () => {
				// Simulate disconnected state
				const closeCallback = mockRedis.on.mock.calls.find(call => call[0] === 'close')?.[1]
				if (closeCallback)
					closeCallback()

				const result = await service.get('test-key')

				expect(result).toBeNull()
				expect(mockRedis.getBuffer).not.toHaveBeenCalled()
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'redis', 'miss')
			})

			it('should deserialize binary format with Buffer data', async () => {
				const imageData = Buffer.from('fake-image-binary-data')
				const metadata = { metadata: { format: 'webp', size: '100' } }
				const metaJson = Buffer.from(JSON.stringify(metadata), 'utf8')

				// Build binary format: [0x00][4 bytes meta length][meta JSON][binary data]
				const header = Buffer.alloc(5)
				header[0] = 0x00
				header.writeUInt32BE(metaJson.length, 1)
				const stored = Buffer.concat([header, metaJson, imageData])

				mockRedis.getBuffer.mockResolvedValue(stored)

				const result = await service.get<{ data: Buffer, metadata: any }>('image-key')

				expect(result).not.toBeNull()
				expect(Buffer.isBuffer(result!.data)).toBe(true)
				expect(result!.data).toEqual(imageData)
				expect(result!.metadata).toEqual(metadata.metadata)
			})

			it('should handle legacy base64 format for backward compatibility', async () => {
				const imageData = Buffer.from('legacy-image-data')
				const legacyValue = JSON.stringify({
					data: { type: 'Buffer', data: imageData.toString('base64') },
					metadata: { format: 'webp' },
				})
				mockRedis.getBuffer.mockResolvedValue(Buffer.from(legacyValue))

				const result = await service.get<{ data: Buffer, metadata: any }>('legacy-key')

				expect(result).not.toBeNull()
				expect(Buffer.isBuffer(result!.data)).toBe(true)
				expect(result!.data).toEqual(imageData)
			})
		})

		describe('set', () => {
			it('should set value in Redis with TTL', async () => {
				const testValue = { test: 'data' }
				const ttl = 3600

				await service.set('test-key', testValue, ttl)

				expect(mockRedis.set).toHaveBeenCalledWith(
					'test-key',
					expect.any(Buffer),
					'EX',
					ttl,
				)
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'redis', 'success')
			})

			it('should set value in Redis with default TTL', async () => {
				const testValue = { test: 'data' }

				await service.set('test-key', testValue)

				expect(mockRedis.set).toHaveBeenCalledWith(
					'test-key',
					expect.any(Buffer),
					'EX',
					mockConfig.ttl,
				)
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'redis', 'success')
			})

			it('should set value without TTL when TTL is 0', async () => {
				const testValue = { test: 'data' }

				await service.set('test-key', testValue, 0)

				expect(mockRedis.set).toHaveBeenCalledWith('test-key', expect.any(Buffer))
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'redis', 'success')
			})

			it('should handle Redis errors', async () => {
				mockRedis.set.mockRejectedValue(new Error('Redis connection failed'))

				// The service should handle errors gracefully and not throw
				await service.set('test-key', { test: 'data' })
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'redis', 'error')
			})

			it('should skip operation when Redis is not connected', async () => {
				// Simulate disconnected state
				const closeCallback = mockRedis.on.mock.calls.find(call => call[0] === 'close')?.[1]
				if (closeCallback)
					closeCallback()

				await service.set('test-key', { test: 'data' })

				expect(mockRedis.set).not.toHaveBeenCalled()
			})

			it('should use binary format for values with Buffer data', async () => {
				const imageData = Buffer.from('test-image-binary')
				const value = { data: imageData, metadata: { format: 'webp' } }

				await service.set('image-key', value, 3600)

				expect(mockRedis.set).toHaveBeenCalled()
				const storedBuffer = mockRedis.set.mock.calls[0][1] as Buffer
				// Binary format starts with 0x00 marker
				expect(storedBuffer[0]).toBe(0x00)
				// Verify it doesn't contain base64 (no bloat)
				expect(storedBuffer.length).toBeLessThan(
					Buffer.from(JSON.stringify({ data: { type: 'Buffer', data: imageData.toString('base64') }, metadata: { format: 'webp' } })).length,
				)
			})
		})

		describe('delete', () => {
			it('should delete key from Redis', async () => {
				await service.delete('test-key')

				expect(mockRedis.del).toHaveBeenCalledWith('test-key')
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('delete', 'redis', 'success')
			})

			it('should handle Redis errors', async () => {
				mockRedis.del.mockRejectedValue(new Error('Redis connection failed'))

				await expect(service.delete('test-key')).rejects.toThrow('Redis connection failed')
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('delete', 'redis', 'error')
			})

			it('should skip operation when Redis is not connected', async () => {
				// Simulate disconnected state
				const closeCallback = mockRedis.on.mock.calls.find(call => call[0] === 'close')?.[1]
				if (closeCallback)
					closeCallback()

				await service.delete('test-key')

				expect(mockRedis.del).not.toHaveBeenCalled()
			})
		})

		describe('clear', () => {
			it('should delete image keys using SCAN + DEL', async () => {
				// Simulate SCAN returning some image keys, then cursor '0' to end
				mockRedis.scan
					.mockResolvedValueOnce(['42', ['image:key1', 'image:key2']])
					.mockResolvedValueOnce(['0', ['image:key3']])

				await service.clear()

				expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'image:*', 'COUNT', 100)
				expect(mockRedis.scan).toHaveBeenCalledWith('42', 'MATCH', 'image:*', 'COUNT', 100)
				expect(mockRedis.del).toHaveBeenCalledWith('image:key1', 'image:key2')
				expect(mockRedis.del).toHaveBeenCalledWith('image:key3')
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('clear', 'redis', 'success')
			})

			it('should handle empty SCAN result', async () => {
				mockRedis.scan.mockResolvedValueOnce(['0', []])

				await service.clear()

				expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'image:*', 'COUNT', 100)
				expect(mockRedis.del).not.toHaveBeenCalled()
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('clear', 'redis', 'success')
			})

			it('should handle Redis errors', async () => {
				mockRedis.scan.mockRejectedValue(new Error('Redis connection failed'))

				await expect(service.clear()).rejects.toThrow('Redis connection failed')
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('clear', 'redis', 'error')
			})
		})

		describe('has', () => {
			it('should return true when key exists', async () => {
				mockRedis.exists.mockResolvedValue(1)

				const result = await service.has('test-key')

				expect(result).toBe(true)
				expect(mockRedis.exists).toHaveBeenCalledWith('test-key')
			})

			it('should return false when key does not exist', async () => {
				mockRedis.exists.mockResolvedValue(0)

				const result = await service.has('test-key')

				expect(result).toBe(false)
			})

			it('should return false on Redis errors', async () => {
				mockRedis.exists.mockRejectedValue(new Error('Redis connection failed'))

				const result = await service.has('test-key')

				expect(result).toBe(false)
			})
		})

		describe('keys', () => {
			it('should return all keys using SCAN iteration', async () => {
				mockRedis.scan
					.mockResolvedValueOnce(['42', ['key1', 'key2']])
					.mockResolvedValueOnce(['0', ['key3']])

				const result = await service.keys()

				expect(result).toEqual(['key1', 'key2', 'key3'])
				expect(mockRedis.scan).toHaveBeenCalledWith('0', 'COUNT', 100)
				expect(mockRedis.scan).toHaveBeenCalledWith('42', 'COUNT', 100)
			})

			it('should return empty array on Redis errors', async () => {
				mockRedis.scan.mockRejectedValue(new Error('Redis connection failed'))

				const result = await service.keys()

				expect(result).toEqual([])
			})
		})

		describe('flushAll', () => {
			it('should flush all databases', async () => {
				await service.flushAll()

				expect(mockRedis.flushall).toHaveBeenCalled()
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('flush', 'redis', 'success')
			})

			it('should handle Redis errors', async () => {
				mockRedis.flushall.mockRejectedValue(new Error('Redis connection failed'))

				await expect(service.flushAll()).rejects.toThrow('Redis connection failed')
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('flush', 'redis', 'error')
			})
		})

		describe('getStats', () => {
			it('should return cache statistics', async () => {
				mockRedis.info.mockImplementation((...args: (string | Buffer)[]) => {
					const section = args[0] as string
					if (section === 'keyspace')
						return Promise.resolve('db0:keys=100,expires=50')
					if (section === 'memory')
						return Promise.resolve('used_memory:1048576')
					return Promise.resolve('')
				})

				// Simulate some cache operations to generate stats
				mockRedis.getBuffer.mockResolvedValueOnce(null) // miss
				await service.get('key1')
				mockRedis.getBuffer.mockResolvedValueOnce(Buffer.from(JSON.stringify({ test: 'data' }))) // hit
				await service.get('key2')
				mockRedis.getBuffer.mockResolvedValueOnce(Buffer.from(JSON.stringify({ test: 'data2' }))) // hit
				await service.get('key3')

				const stats = await service.getStats()

				expect(stats).toEqual({
					hits: 2,
					misses: 1,
					keys: 100,
					ksize: 0,
					vsize: 1048576,
					hitRate: 0.6666666666666666,
				})
				expect(metricsService.updateCacheHitRatio).toHaveBeenCalledWith('redis', 0.6666666666666666)
			})

			it('should handle Redis info errors gracefully', async () => {
				mockRedis.info.mockRejectedValue(new Error('Redis connection failed'))

				const stats = await service.getStats()

				expect(stats.keys).toBe(0)
				expect(stats.vsize).toBe(0)
			})
		})
	})

	describe('redis-specific methods', () => {
		beforeEach(async () => {
			await service.onModuleInit()

			// Update mockRedis to the latest instance after onModuleInit
			const RedisMock = Redis as any
			if (RedisMock.mock && RedisMock.mock.instances.length > 0) {
				mockRedis = RedisMock.mock.instances.at(-1)
			}

			// Simulate ready event
			const readyCallback = mockRedis.on.mock.calls.find(call => call[0] === 'ready')?.[1]
			if (readyCallback)
				readyCallback()
		})

		describe('ping', () => {
			it('should ping Redis successfully', async () => {
				const result = await service.ping()

				expect(result).toBe('PONG')
				expect(mockRedis.ping).toHaveBeenCalled()
			})

			it('should throw error when Redis is not connected', async () => {
				// Simulate disconnected state
				const closeCallback = mockRedis.on.mock.calls.find(call => call[0] === 'close')?.[1]
				if (closeCallback)
					closeCallback()

				await expect(service.ping()).rejects.toThrow('Redis not connected')
			})
		})

		describe('getTtl', () => {
			it('should get TTL for key', async () => {
				mockRedis.ttl.mockResolvedValue(3600)

				const result = await service.getTtl('test-key')

				expect(result).toBe(3600)
				expect(mockRedis.ttl).toHaveBeenCalledWith('test-key')
			})

			it('should return -1 when Redis is not connected', async () => {
				// Simulate disconnected state
				const closeCallback = mockRedis.on.mock.calls.find(call => call[0] === 'close')?.[1]
				if (closeCallback)
					closeCallback()

				const result = await service.getTtl('test-key')

				expect(result).toBe(-1)
			})
		})

		describe('setTtl', () => {
			it('should set TTL for key', async () => {
				mockRedis.expire.mockResolvedValue(1)

				const result = await service.setTtl('test-key', 3600)

				expect(result).toBe(true)
				expect(mockRedis.expire).toHaveBeenCalledWith('test-key', 3600)
			})

			it('should return false when key does not exist', async () => {
				mockRedis.expire.mockResolvedValue(0)

				const result = await service.setTtl('non-existent-key', 3600)

				expect(result).toBe(false)
			})
		})

		describe('getConnectionStatus', () => {
			it('should return connection status and stats', async () => {
				const status = service.getConnectionStatus()

				expect(status).toEqual({
					connected: true,
					stats: {
						hits: 0,
						misses: 0,
						operations: 0,
						errors: 0,
					},
				})
			})
		})

		describe('getMemoryUsage', () => {
			it('should return memory usage information', async () => {
				mockRedis.info.mockResolvedValue(
					'used_memory:1048576\nused_memory_peak:2097152\nmem_fragmentation_ratio:1.25',
				)

				const result = await service.getMemoryUsage()

				expect(result).toEqual({
					used: 1048576,
					peak: 2097152,
					fragmentation: 1.25,
				})
			})

			it('should return zeros when Redis is not connected', async () => {
				// Simulate disconnected state
				const closeCallback = mockRedis.on.mock.calls.find(call => call[0] === 'close')?.[1]
				if (closeCallback)
					closeCallback()

				const result = await service.getMemoryUsage()

				expect(result).toEqual({
					used: 0,
					peak: 0,
					fragmentation: 0,
				})
			})
		})
	})
})
