import { RedisHealthIndicator } from '@microservice/Cache/indicators/redis-health.indicator'
import { RedisCacheService } from '@microservice/Cache/services/redis-cache.service'
import { ConfigService } from '@microservice/Config/config.service'
import { Test, TestingModule } from '@nestjs/testing'

describe('redisHealthIndicator', () => {
	let indicator: RedisHealthIndicator
	let redisCacheService: jest.Mocked<RedisCacheService>
	// eslint-disable-next-line unused-imports/no-unused-vars
	let configService: jest.Mocked<ConfigService>

	const mockConfig = {
		host: 'localhost',
		port: 6379,
		db: 0,
		ttl: 7200,
		maxRetries: 3,
	}

	beforeEach(async () => {
		const mockRedisCacheService = {
			ping: jest.fn(),
			get: jest.fn(),
			set: jest.fn(),
			delete: jest.fn(),
			getTtl: jest.fn(),
			getStats: jest.fn(),
			getMemoryUsage: jest.fn(),
			getConnectionStatus: jest.fn(),
			keys: jest.fn(),
		}

		const mockConfigService = {
			get: jest.fn().mockImplementation((key: string) => {
				if (key === 'cache.redis.host')
					return mockConfig.host
				if (key === 'cache.redis.port')
					return mockConfig.port
				if (key === 'cache.redis.db')
					return mockConfig.db
				if (key === 'cache.redis.ttl')
					return mockConfig.ttl
				if (key === 'cache.redis.maxRetries')
					return mockConfig.maxRetries
				return undefined
			}),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RedisHealthIndicator,
				{ provide: RedisCacheService, useValue: mockRedisCacheService },
				{ provide: ConfigService, useValue: mockConfigService },
			],
		}).compile()

		indicator = module.get<RedisHealthIndicator>(RedisHealthIndicator)
		redisCacheService = module.get(RedisCacheService)
		configService = module.get(ConfigService)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('performHealthCheck', () => {
		it('should return healthy status when all operations succeed', async () => {
			let capturedValue: any = null
			let deleteWasCalled = false

			redisCacheService.ping.mockResolvedValue('PONG')
			redisCacheService.set.mockImplementation(async (key, value) => {
				capturedValue = value
				return undefined
			})
			redisCacheService.get.mockImplementation(async (key) => {
				if (key === 'health-check-redis-test' && !deleteWasCalled) {
					return capturedValue
				}
				return null
			})
			redisCacheService.getTtl.mockResolvedValue(59)
			redisCacheService.delete.mockImplementation(async (key) => {
				if (key === 'health-check-redis-test') {
					deleteWasCalled = true
				}
				return undefined
			})
			redisCacheService.getStats.mockResolvedValue({
				hits: 10,
				misses: 2,
				keys: 100,
				ksize: 0,
				vsize: 1048576,
				hitRate: 0.83,
			})
			redisCacheService.getMemoryUsage.mockResolvedValue({
				used: 1048576,
				peak: 2097152,
				fragmentation: 1.2,
			})
			redisCacheService.getConnectionStatus.mockReturnValue({
				connected: true,
				stats: { hits: 10, misses: 2, operations: 15, errors: 0 },
			})

			const result = await indicator.isHealthy()

			expect(result.redis.status).toBe('up')
			expect(result.redis.connection.connected).toBe(true)
			expect(result.redis.statistics.hitRate).toBe(83)
			expect(result.redis.memory.usedMB).toBe(1)
			expect(result.redis.warnings).toEqual([])
		})

		it('should return unhealthy status when ping fails', async () => {
			redisCacheService.ping.mockResolvedValue('ERROR')

			const result = await indicator.isHealthy()

			expect(result.redis.status).toBe('down')
			expect(result.redis.error).toContain('Redis ping failed')
		})

		it('should return unhealthy status when GET operation fails', async () => {
			redisCacheService.ping.mockResolvedValue('PONG')
			redisCacheService.set.mockResolvedValue(undefined)
			redisCacheService.get.mockResolvedValue({ timestamp: 123, test: true }) // Different timestamp
			redisCacheService.getTtl.mockResolvedValue(59)

			const result = await indicator.isHealthy()

			expect(result.redis.status).toBe('down')
			expect(result.redis.error).toContain('Redis GET operation failed')
		})

		it('should return unhealthy status when TTL operation fails', async () => {
			let storedValue: any = null

			redisCacheService.ping.mockResolvedValue('PONG')
			redisCacheService.set.mockImplementation((key, value) => {
				storedValue = value
				return Promise.resolve(undefined)
			})
			redisCacheService.get.mockImplementation(() => Promise.resolve(storedValue))
			redisCacheService.getTtl.mockResolvedValue(-1) // Invalid TTL

			const result = await indicator.isHealthy()

			expect(result.redis.status).toBe('down')
			expect(result.redis.error).toContain('Redis TTL operation failed')
		})

		it('should return unhealthy status when DELETE operation fails', async () => {
			let storedValue: any = null
			let getCallCount = 0

			redisCacheService.ping.mockResolvedValue('PONG')
			redisCacheService.set.mockImplementation(async (key, value) => {
				storedValue = value
				return undefined
			})
			redisCacheService.get.mockImplementation(async (_key) => {
				getCallCount++
				if (getCallCount === 1) {
					// First GET call: return the stored value (for GET operation test)
					return storedValue
				}
				else {
					// Second GET call: return the stored value again (should be null after delete, but we return the value to simulate delete failure)
					return storedValue
				}
			})
			redisCacheService.getTtl.mockResolvedValue(59)
			redisCacheService.delete.mockResolvedValue(undefined)

			const result = await indicator.isHealthy()

			expect(result.redis.status).toBe('down')
			expect(result.redis.error).toContain('Redis DELETE operation failed')
		})

		it('should handle Redis connection errors', async () => {
			redisCacheService.ping.mockRejectedValue(new Error('Connection refused'))

			const result = await indicator.isHealthy()

			expect(result.redis.status).toBe('down')
			expect(result.redis.error).toBe('Connection refused')
			expect(result.redis.connection.connected).toBe(false)
		})

		it('should return unhealthy status for slow response times', async () => {
			const testValue = { timestamp: Date.now(), test: true }

			// Mock slow operations
			redisCacheService.ping.mockImplementation(() =>
				new Promise(resolve => setTimeout(() => resolve('PONG'), 250)),
			)
			redisCacheService.set.mockResolvedValue(undefined)
			redisCacheService.get.mockResolvedValue(testValue)
			redisCacheService.getTtl.mockResolvedValue(59)
			redisCacheService.delete.mockResolvedValue(undefined)
			redisCacheService.get.mockResolvedValueOnce(testValue).mockResolvedValueOnce(null)
			redisCacheService.getStats.mockResolvedValue({
				hits: 10,
				misses: 2,
				keys: 100,
				ksize: 0,
				vsize: 1048576,
				hitRate: 0.83,
			})
			redisCacheService.getMemoryUsage.mockResolvedValue({
				used: 1048576,
				peak: 2097152,
				fragmentation: 1.2,
			})
			redisCacheService.getConnectionStatus.mockReturnValue({
				connected: true,
				stats: { hits: 10, misses: 2, operations: 15, errors: 0 },
			})

			const result = await indicator.isHealthy()

			expect(result.redis.status).toBe('down')
			expect(Number.parseInt(result.redis.responseTime)).toBeGreaterThan(200)
		})

		it('should generate warnings for performance issues', async () => {
			const testValue = { timestamp: Date.now(), test: true }

			redisCacheService.ping.mockResolvedValue('PONG')
			redisCacheService.set.mockResolvedValue(undefined)
			redisCacheService.get.mockResolvedValue(testValue)
			redisCacheService.getTtl.mockResolvedValue(59)
			redisCacheService.delete.mockResolvedValue(undefined)
			redisCacheService.get.mockResolvedValueOnce(testValue).mockResolvedValueOnce(null)
			redisCacheService.getStats.mockResolvedValue({
				hits: 5,
				misses: 10,
				keys: 100,
				ksize: 0,
				vsize: 1048576,
				hitRate: 0.33, // Low hit rate
			})
			redisCacheService.getMemoryUsage.mockResolvedValue({
				used: 209715200, // 200MB
				peak: 2097152,
				fragmentation: 2.0, // High fragmentation
			})
			redisCacheService.getConnectionStatus.mockReturnValue({
				connected: true,
				stats: { hits: 5, misses: 10, operations: 20, errors: 3 }, // Has errors
			})

			const result = await indicator.isHealthy()

			expect(result.redis.warnings).toEqual(
				expect.arrayContaining([
					expect.stringContaining('Cache hit rate (33%) is below optimal (70%)'),
				]),
			)
			expect(result.redis.warnings).toEqual(
				expect.arrayContaining([
					expect.stringContaining('Memory fragmentation (2) is high (>1.5)'),
					expect.stringContaining('Redis has recorded 3 errors'),
					expect.stringContaining('Memory usage (200MB) is high'),
				]),
			)
		})
	})

	describe('getDetailedStatus', () => {
		it('should return detailed Redis status when connected', async () => {
			redisCacheService.getStats.mockResolvedValue({
				hits: 100,
				misses: 20,
				keys: 50,
				ksize: 0,
				vsize: 1048576,
				hitRate: 0.83,
			})
			redisCacheService.getMemoryUsage.mockResolvedValue({
				used: 1048576,
				peak: 2097152,
				fragmentation: 1.2,
			})
			redisCacheService.getConnectionStatus.mockReturnValue({
				connected: true,
				stats: { hits: 100, misses: 20, operations: 150, errors: 1 },
			})
			redisCacheService.keys.mockResolvedValue(['key1', 'key2', 'key3'])

			const result = await indicator.getDetailedStatus()

			expect(result).toEqual({
				type: 'redis-cache',
				status: 'operational',
				connection: {
					connected: true,
					host: mockConfig.host,
					port: mockConfig.port,
					db: mockConfig.db,
				},
				statistics: {
					hits: 100,
					misses: 20,
					keys: 50,
					ksize: 0,
					vsize: 1048576,
					hitRate: 0.83,
					operations: 150,
					errors: 1,
				},
				memory: {
					used: 1048576,
					peak: 2097152,
					fragmentation: 1.2,
					usedMB: 1,
					peakMB: 2,
				},
				configuration: {
					host: mockConfig.host,
					port: mockConfig.port,
					db: mockConfig.db,
					ttl: mockConfig.ttl,
					maxRetries: mockConfig.maxRetries,
				},
				recentKeys: ['key1', 'key2', 'key3'],
				lastUpdated: expect.any(String),
			})
		})

		it('should return disconnected status when not connected', async () => {
			redisCacheService.getConnectionStatus.mockReturnValue({
				connected: false,
				stats: { hits: 0, misses: 0, operations: 0, errors: 5 },
			})
			redisCacheService.getStats.mockResolvedValue({
				hits: 0,
				misses: 0,
				keys: 0,
				ksize: 0,
				vsize: 0,
				hitRate: 0,
			})
			redisCacheService.getMemoryUsage.mockResolvedValue({
				used: 0,
				peak: 0,
				fragmentation: 0,
			})
			redisCacheService.keys.mockResolvedValue([])

			const result = await indicator.getDetailedStatus()

			expect(result.status).toBe('disconnected')
			expect(result.connection.connected).toBe(false)
		})

		it('should handle errors gracefully', async () => {
			redisCacheService.getStats.mockRejectedValue(new Error('Connection failed'))

			const result = await indicator.getDetailedStatus()

			expect(result).toEqual({
				type: 'redis-cache',
				status: 'error',
				error: 'Connection failed',
				lastUpdated: expect.any(String),
			})
		})
	})

	describe('getDescription', () => {
		it('should return correct description', () => {
			// Access the protected method through any casting for testing
			const description = (indicator as any).getDescription()
			expect(description).toBe('Redis cache health indicator that tests connection and basic operations')
		})
	})

	describe('key property', () => {
		it('should have correct key', () => {
			expect(indicator.key).toBe('redis')
		})
	})
})
