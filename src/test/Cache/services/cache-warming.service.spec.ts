import type { Dirent } from 'node:fs'
import type { MockedFunction, MockedObject } from 'vitest'
import { Buffer } from 'node:buffer'
import { access, readdir, readFile, stat } from 'node:fs/promises'
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
const mockAccess = access as unknown as MockedFunction<typeof access>

/** Create a mock Dirent for readdir({ withFileTypes: true }) */
function mockDirent(name: string, isFile = true): Dirent {
	return { name, isFile: () => isFile, isDirectory: () => !isFile, isBlockDevice: () => false, isCharacterDevice: () => false, isFIFO: () => false, isSocket: () => false, isSymbolicLink: () => false, path: '', parentPath: '' } as Dirent
}

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
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc'), mockDirent('file2.rsc'), mockDirent('file3.rsc')] as any)
			mockAccess.mockResolvedValue(undefined)
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
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc')] as any)
			mockAccess.mockResolvedValue(undefined)
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

			mockReaddir.mockResolvedValue([mockDirent('file1.rsc'), mockDirent('file2.rsc'), mockDirent('file3.rsc')] as any)
			mockAccess.mockResolvedValue(undefined)
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
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc'), mockDirent('file2.rsc')] as any)
			mockAccess.mockResolvedValue(undefined)
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
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc'), mockDirent('file2.rsc')] as any)
			mockAccess.mockResolvedValue(undefined)
			mockStat.mockResolvedValue({
				atime: new Date(),
				size: 1024,
			} as any)
			// Call order:
			//   getPopularFiles: file1.rsm (mock 1), file2.rsm (mock 2)
			//   warmupFile(file1): file1.rsc (mock 3), file1.rsm (mock 4, caught internally)
			//   warmupFile(file2): file2.rsc (mock 5 — rejected, not caught → file2 fails), file2.rsm (mock 6, may not run)
			mockReadFile
				.mockResolvedValueOnce('{"accessCount": 10}') // getPopularFiles file1 meta
				.mockResolvedValueOnce('{"accessCount": 8}') // getPopularFiles file2 meta
				.mockResolvedValueOnce(Buffer.from('file content')) // warmupFile file1 content (success)
				.mockResolvedValueOnce(null) // warmupFile file1 meta (caught internally)
				.mockRejectedValueOnce(new Error('File read error')) // warmupFile file2 content (fails)

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

			expect(cacheManager.set).toHaveBeenCalledWith('image', resourceId, expect.objectContaining({ data: content, metadata: expect.any(Object) }), ttl)
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
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc')] as any)
			mockAccess.mockResolvedValue(undefined)
			mockStat.mockResolvedValue({
				atime: new Date(),
				size: 1024,
			} as any)
			// Call order:
			//   getPopularFiles: file1.rsm (mock 1)
			//   warmupFile(file1): file1.rsc (mock 2), file1.rsm (mock 3, caught internally)
			mockReadFile
				.mockResolvedValueOnce('{"accessCount": 20}') // getPopularFiles file1 meta
				.mockResolvedValueOnce(Buffer.from('file content')) // warmupFile file1 content
				.mockResolvedValueOnce('{"accessCount": 20}') // warmupFile file1 meta (re-read)

			cacheManager.exists.mockResolvedValue(false)
			cacheManager.set.mockResolvedValue()

			await service.warmupCache()

			// Service sets { data: content, metadata } as the value, not a raw Buffer
			expect(cacheManager.set).toHaveBeenCalledWith(
				'image',
				expect.any(String),
				expect.any(Object),
				expect.any(Number),
			)

			const [, , , ttl] = cacheManager.set.mock.calls[0]
			expect(ttl).toBeGreaterThan(3600) // Should be higher than base TTL
		})
	})
})
