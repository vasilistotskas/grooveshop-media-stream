import { Buffer } from 'node:buffer'
import { RedisCacheService } from '@microservice/Cache/services/redis-cache.service'
import { ConfigService } from '@microservice/Config/config.service'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'
import Redis from 'ioredis'

// Mock ioredis
jest.mock('ioredis')

describe('redisCacheService', () => {
	let service: RedisCacheService
	let metricsService: jest.Mocked<MetricsService>
	let mockRedis: jest.Mocked<Redis>

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
		// Create mock Redis instance
		mockRedis = {
			connect: jest.fn().mockResolvedValue(undefined),
			quit: jest.fn().mockResolvedValue('OK'),
			get: jest.fn(),
			set: jest.fn().mockResolvedValue('OK'),
			setex: jest.fn().mockResolvedValue('OK'),
			del: jest.fn().mockResolvedValue(1),
			flushdb: jest.fn().mockResolvedValue('OK'),
			flushall: jest.fn().mockResolvedValue('OK'),
			exists: jest.fn(),
			keys: jest.fn().mockResolvedValue(['key1', 'key2']),
			ping: jest.fn().mockResolvedValue('PONG'),
			ttl: jest.fn().mockResolvedValue(3600),
			expire: jest.fn().mockResolvedValue(1),
			info: jest.fn(),
			on: jest.fn(),
		} as any

		// Mock Redis constructor
		;(Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis)

		const mockConfigService = {
			get: jest.fn().mockImplementation((key: string) => {
				if (key === 'cache.redis')
					return mockConfig
				if (key === 'cache.redis.ttl')
					return mockConfig.ttl
				return undefined
			}),
		}

		const mockMetricsService = {
			recordCacheOperation: jest.fn(),
			updateCacheHitRatio: jest.fn(),
			updateActiveConnections: jest.fn(),
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
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('initialization', () => {
		it('should be defined', () => {
			expect(service).toBeDefined()
		})

		it('should initialize Redis connection on module init', async () => {
			await service.onModuleInit()

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

			expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function))
			expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function))
			expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function))
			expect(mockRedis.on).toHaveBeenCalledWith('close', expect.any(Function))
			expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', expect.any(Function))
		})

		it('should close Redis connection on module destroy', async () => {
			await service.onModuleInit()
			await service.onModuleDestroy()

			expect(mockRedis.quit).toHaveBeenCalled()
		})
	})

	describe('cache operations', () => {
		beforeEach(async () => {
			await service.onModuleInit()
			// Simulate ready event
			const readyCallback = mockRedis.on.mock.calls.find(call => call[0] === 'ready')?.[1]
			if (readyCallback)
				readyCallback()
		})

		describe('get', () => {
			it('should get value from Redis and parse JSON', async () => {
				const testValue = { test: 'data', number: 42 }
				mockRedis.get.mockResolvedValue(JSON.stringify(testValue))

				const result = await service.get<typeof testValue>('test-key')

				expect(mockRedis.get).toHaveBeenCalledWith('test-key')
				expect(result).toEqual(testValue)
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'redis', 'hit')
			})

			it('should return null when key does not exist', async () => {
				mockRedis.get.mockResolvedValue(null)

				const result = await service.get('non-existent-key')

				expect(result).toBeNull()
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'redis', 'miss')
			})

			it('should handle Redis errors gracefully', async () => {
				mockRedis.get.mockRejectedValue(new Error('Redis connection failed'))

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
				expect(mockRedis.get).not.toHaveBeenCalled()
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('get', 'redis', 'miss')
			})
		})

		describe('set', () => {
			it('should set value in Redis with TTL', async () => {
				const testValue = { test: 'data' }
				const ttl = 3600

				await service.set('test-key', testValue, ttl)

				expect(mockRedis.setex).toHaveBeenCalledWith('test-key', ttl, JSON.stringify(testValue))
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'redis', 'success')
			})

			it('should set value in Redis with default TTL', async () => {
				const testValue = { test: 'data' }

				await service.set('test-key', testValue)

				expect(mockRedis.setex).toHaveBeenCalledWith('test-key', mockConfig.ttl, JSON.stringify(testValue))
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'redis', 'success')
			})

			it('should set value without TTL when TTL is 0', async () => {
				const testValue = { test: 'data' }

				await service.set('test-key', testValue, 0)

				expect(mockRedis.set).toHaveBeenCalledWith('test-key', JSON.stringify(testValue))
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('set', 'redis', 'success')
			})

			it('should handle Redis errors', async () => {
				mockRedis.setex.mockRejectedValue(new Error('Redis connection failed'))

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

				expect(mockRedis.setex).not.toHaveBeenCalled()
				expect(mockRedis.set).not.toHaveBeenCalled()
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
			it('should flush current database', async () => {
				await service.clear()

				expect(mockRedis.flushdb).toHaveBeenCalled()
				expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('clear', 'redis', 'success')
			})

			it('should handle Redis errors', async () => {
				mockRedis.flushdb.mockRejectedValue(new Error('Redis connection failed'))

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
			it('should return all keys', async () => {
				const mockKeys = ['key1', 'key2', 'key3']
				mockRedis.keys.mockResolvedValue(mockKeys)

				const result = await service.keys()

				expect(result).toEqual(mockKeys)
				expect(mockRedis.keys).toHaveBeenCalledWith('*')
			})

			it('should return empty array on Redis errors', async () => {
				mockRedis.keys.mockRejectedValue(new Error('Redis connection failed'))

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
				mockRedis.get.mockResolvedValueOnce(null) // miss
				await service.get('key1')
				mockRedis.get.mockResolvedValueOnce(JSON.stringify({ test: 'data' })) // hit
				await service.get('key2')
				mockRedis.get.mockResolvedValueOnce(JSON.stringify({ test: 'data2' })) // hit
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
