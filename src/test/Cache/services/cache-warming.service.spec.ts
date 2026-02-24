import type { MockedFunction, MockedObject } from 'vitest'
import { Buffer } from 'node:buffer'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { CacheWarmingService } from '#microservice/Cache/services/cache-warming.service'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock fs promises
vi.mock('node:fs/promises')
vi.mock('node:path')

const mockReaddir = readdir as unknown as MockedFunction<typeof readdir>
const mockStat = stat as unknown as MockedFunction<typeof stat>
const mockReadFile = readFile as unknown as MockedFunction<typeof readFile>
const mockJoin = join as unknown as MockedFunction<typeof join>

describe('cacheWarmingService', () => {
	let service: CacheWarmingService
	let cacheManager: MockedObject<MultiLayerCacheManager>
	let configService: MockedObject<ConfigService>
	let metricsService: MockedObject<MetricsService>

	beforeEach(async () => {
		const mockCacheManager = {
			exists: vi.fn(),
			set: vi.fn(),
			get: vi.fn(),
			delete: vi.fn(),
			clear: vi.fn(),
			getStats: vi.fn(),
		}

		const mockConfigService = {
			get: vi.fn(),
			getOptional: vi.fn((key: string, defaultValue: any) => {
				if (key === 'cache.warming.baseTtl')
					return 3600
				return defaultValue
			}),
		}

		const mockMetricsService = {
			recordCacheOperation: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				CacheWarmingService,
				{
					provide: MultiLayerCacheManager,
					useValue: mockCacheManager,
				},
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
				{
					provide: MetricsService,
					useValue: mockMetricsService,
				},
			],
		}).compile()

		service = module.get<CacheWarmingService>(CacheWarmingService)
		cacheManager = module.get(MultiLayerCacheManager)
		configService = module.get(ConfigService)
		metricsService = module.get(MetricsService)

		// Setup default config
		configService.get.mockImplementation((key: string) => {
			const config = {
				'cache.warming': {
					enabled: true,
					warmupOnStart: true,
					maxFilesToWarm: 50,
					warmupCron: '0 */6 * * *',
					popularImageThreshold: 5,
				},
			}
			return (config as any)[key]
		})

		// Setup default mocks
		mockJoin.mockImplementation((...paths) => paths.join('/'))
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('initialization', () => {
		it('should be defined', () => {
			expect(service).toBeDefined()
		})

		it('should load configuration on initialization', () => {
			expect(configService.get).toHaveBeenCalledWith('cache.warming')
		})
	})

	describe('cache Warmup', () => {
		it('should warm up popular files', async () => {
			// Mock file system
			mockReaddir.mockResolvedValue(['file1.rsc', 'file2.rsc', 'file3.rsc'] as any)
			mockStat.mockResolvedValue({
				atime: new Date(),
				size: 1024,
			} as any)
			mockReadFile
				.mockResolvedValueOnce('{"accessCount": 10}') // metadata
				.mockResolvedValueOnce('{"accessCount": 8}') // metadata
				.mockResolvedValueOnce('{"accessCount": 6}') // metadata
				.mockResolvedValue(Buffer.from('file content')) // file content

			cacheManager.exists.mockResolvedValue(false)
			cacheManager.set.mockResolvedValue()

			await service.warmupCache()

			expect(mockReaddir).toHaveBeenCalled()
			expect(cacheManager.set).toHaveBeenCalledTimes(3)
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('warmup', 'memory', 'success')
		})

		it('should skip files already in cache', async () => {
			mockReaddir.mockResolvedValue(['file1.rsc'] as any)
			mockStat.mockResolvedValue({
				atime: new Date(),
				size: 1024,
			} as any)
			mockReadFile.mockResolvedValue('{"accessCount": 10}')

			cacheManager.exists.mockResolvedValue(true) // Already in cache
			cacheManager.set.mockResolvedValue()

			await service.warmupCache()

			expect(cacheManager.set).not.toHaveBeenCalled()
		})

		it('should limit number of files warmed up', async () => {
			// Override config to limit files
			configService.get.mockImplementation((key: string) => {
				if (key === 'cache.warming') {
					return {
						enabled: true,
						warmupOnStart: true,
						maxFilesToWarm: 2, // Limit to 2 files
						warmupCron: '0 */6 * * *',
						popularImageThreshold: 5,
					}
				}
				return undefined
			})

			// Create new service instance with updated config
			const module: TestingModule = await Test.createTestingModule({
				providers: [
					CacheWarmingService,
					{
						provide: MultiLayerCacheManager,
						useValue: cacheManager,
					},
					{
						provide: ConfigService,
						useValue: configService,
					},
					{
						provide: MetricsService,
						useValue: metricsService,
					},
				],
			}).compile()

			const limitedService = module.get<CacheWarmingService>(CacheWarmingService)

			mockReaddir.mockResolvedValue(['file1.rsc', 'file2.rsc', 'file3.rsc'] as any)
			mockStat.mockResolvedValue({
				atime: new Date(),
				size: 1024,
			} as any)
			mockReadFile
				.mockResolvedValueOnce('{"accessCount": 10}')
				.mockResolvedValueOnce('{"accessCount": 8}')
				.mockResolvedValueOnce('{"accessCount": 6}')
				.mockResolvedValue(Buffer.from('file content'))

			cacheManager.exists.mockResolvedValue(false)
			cacheManager.set.mockResolvedValue()

			await limitedService.warmupCache()

			expect(cacheManager.set).toHaveBeenCalledTimes(2) // Limited to 2 files
		})

		it('should filter files by popularity threshold', async () => {
			mockReaddir.mockResolvedValue(['file1.rsc', 'file2.rsc'] as any)
			mockStat.mockResolvedValue({
				atime: new Date(),
				size: 1024,
			} as any)
			mockReadFile
				.mockResolvedValueOnce('{"accessCount": 10}') // Above threshold
				.mockResolvedValueOnce('{"accessCount": 2}') // Below threshold
				.mockResolvedValue(Buffer.from('file content'))

			cacheManager.exists.mockResolvedValue(false)
			cacheManager.set.mockResolvedValue()

			await service.warmupCache()

			expect(cacheManager.set).toHaveBeenCalledTimes(1) // Only 1 file above threshold
		})

		it('should handle file system errors gracefully', async () => {
			mockReaddir.mockRejectedValue(new Error('File system error'))

			await service.warmupCache()

			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('warmup', 'memory', 'success')
		})

		it('should handle individual file errors gracefully', async () => {
			mockReaddir.mockResolvedValue(['file1.rsc', 'file2.rsc'] as any)
			mockStat.mockResolvedValue({
				atime: new Date(),
				size: 1024,
			} as any)
			mockReadFile
				.mockResolvedValueOnce('{"accessCount": 10}')
				.mockResolvedValueOnce('{"accessCount": 8}')
				.mockResolvedValueOnce(Buffer.from('file content')) // First file succeeds
				.mockRejectedValueOnce(new Error('File read error')) // Second file fails

			cacheManager.exists.mockResolvedValue(false)
			cacheManager.set.mockResolvedValue()

			await service.warmupCache()

			expect(cacheManager.set).toHaveBeenCalledTimes(1) // Only successful file
			expect(metricsService.recordCacheOperation).toHaveBeenCalledWith('warmup', 'memory', 'success')
		})
	})

	describe('manual Warmup', () => {
		it('should manually warm up specific file', async () => {
			const resourceId = 'test-resource'
			const content = Buffer.from('test content')
			const ttl = 3600

			cacheManager.set.mockResolvedValue()

			await service.warmupSpecificFile(resourceId, content, ttl)

			expect(cacheManager.set).toHaveBeenCalledWith('image', resourceId, content, ttl)
		})

		it('should handle manual warmup errors', async () => {
			const resourceId = 'test-resource'
			const content = Buffer.from('test content')

			cacheManager.set.mockRejectedValue(new Error('Cache error'))

			await expect(service.warmupSpecificFile(resourceId, content)).rejects.toThrow('Cache error')
		})
	})

	describe('statistics', () => {
		it('should return warmup statistics', async () => {
			const stats = await service.getWarmupStats()

			expect(stats).toHaveProperty('enabled')
			expect(stats).toHaveProperty('lastWarmup')
			expect(stats).toHaveProperty('filesWarmed')
			expect(stats.enabled).toBe(true)
			expect(stats.filesWarmed).toBe(0)
		})
	})

	describe('configuration', () => {
		it('should respect disabled configuration', async () => {
			configService.get.mockImplementation((key: string) => {
				if (key === 'cache.warming') {
					return {
						enabled: false,
						warmupOnStart: true,
						maxFilesToWarm: 50,
						warmupCron: '0 */6 * * *',
						popularImageThreshold: 5,
					}
				}
				return undefined
			})

			// Create new service instance with disabled config
			const module: TestingModule = await Test.createTestingModule({
				providers: [
					CacheWarmingService,
					{
						provide: MultiLayerCacheManager,
						useValue: cacheManager,
					},
					{
						provide: ConfigService,
						useValue: configService,
					},
					{
						provide: MetricsService,
						useValue: metricsService,
					},
				],
			}).compile()

			const disabledService = module.get<CacheWarmingService>(CacheWarmingService)

			await disabledService.warmupCache()

			expect(mockReaddir).not.toHaveBeenCalled()
		})

		it('should use default configuration when not provided', () => {
			configService.get.mockReturnValue(undefined)

			// Create new service instance
			const module = Test.createTestingModule({
				providers: [
					CacheWarmingService,
					{
						provide: MultiLayerCacheManager,
						useValue: cacheManager,
					},
					{
						provide: ConfigService,
						useValue: configService,
					},
					{
						provide: MetricsService,
						useValue: metricsService,
					},
				],
			})

			expect(() => module.compile()).not.toThrow()
		})
	})

	describe('tTL Calculation', () => {
		it('should calculate TTL based on access patterns', async () => {
			mockReaddir.mockResolvedValue(['file1.rsc'] as any)
			mockStat.mockResolvedValue({
				atime: new Date(),
				size: 1024,
			} as any)
			mockReadFile
				.mockResolvedValueOnce('{"accessCount": 20}') // High access count
				.mockResolvedValueOnce(Buffer.from('file content'))

			cacheManager.exists.mockResolvedValue(false)
			cacheManager.set.mockResolvedValue()

			await service.warmupCache()

			// Should set with higher TTL due to high access count
			expect(cacheManager.set).toHaveBeenCalledWith(
				'image',
				expect.any(String),
				expect.any(Buffer),
				expect.any(Number),
			)

			const [, , , ttl] = cacheManager.set.mock.calls[0]
			expect(ttl).toBeGreaterThan(3600) // Should be higher than base TTL
		})
	})
})
