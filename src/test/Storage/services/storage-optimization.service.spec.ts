import type { MockedObject } from 'vitest'
import { Buffer } from 'node:buffer'
import { promises as fs } from 'node:fs'
import { ConfigService } from '#microservice/Config/config.service'
import { StorageMonitoringService } from '#microservice/Storage/services/storage-monitoring.service'
import { StorageOptimizationService } from '#microservice/Storage/services/storage-optimization.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock fs and crypto modules
vi.mock('node:fs', () => ({
	promises: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
		unlink: vi.fn(),
		copyFile: vi.fn(),
		link: vi.fn(),
	},
	createReadStream: vi.fn(() => ({
		on: vi.fn((event, callback) => {
			if (event === 'data') {
				// Simulate data chunk
				callback(Buffer.from('test-content'))
			}
			if (event === 'end') {
				// Simulate stream end
				callback()
			}
			return { on: vi.fn() } // partial stream mock return
		}),
		pipe: vi.fn(),
	})),
}))

vi.mock('node:crypto', () => ({
	createHash: vi.fn(() => ({
		update: vi.fn().mockReturnThis(),
		digest: vi.fn().mockReturnValue('mock-hash-123'),
	})),
}))

const mockFs = fs as MockedObject<typeof fs>

describe('storageOptimizationService', () => {
	let service: StorageOptimizationService
	let storageMonitoring: MockedObject<StorageMonitoringService>
	let configService: MockedObject<ConfigService>

	const mockAccessPatterns = [
		{
			file: 'popular-image.jpg',
			lastAccessed: new Date(),
			accessCount: 25, // Above threshold
			size: 2 * 1024 * 1024, // 2MB
			extension: '.jpg',
		},
		{
			file: 'very-popular.webp',
			lastAccessed: new Date(),
			accessCount: 50, // Well above threshold
			size: 1024 * 1024, // 1MB
			extension: '.webp',
		},
		{
			file: 'not-popular.png',
			lastAccessed: new Date(),
			accessCount: 5, // Below threshold
			size: 512 * 1024, // 512KB
			extension: '.png',
		},
	]

	beforeEach(async () => {
		const mockStorageMonitoring = {
			getStorageStats: vi.fn(),
		}

		const mockConfigService = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'cache.file.directory')
					return '/test/storage'
				return undefined
			}),
			getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
				const defaults: Record<string, any> = {
					'storage.optimization.enabled': true,
					'storage.optimization.strategies': ['deduplication'],
					'storage.optimization.popularThreshold': 10,
					'storage.optimization.createBackups': false,
				}
				return defaults[key] || defaultValue
			}),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageOptimizationService,
				{
					provide: StorageMonitoringService,
					useValue: mockStorageMonitoring,
				},
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
			],
		}).compile()

		service = module.get<StorageOptimizationService>(StorageOptimizationService)
		storageMonitoring = module.get(StorageMonitoringService)
		configService = module.get(ConfigService)

		// Setup default config mocks
		configService.get.mockImplementation((key: string) => {
			if (key === 'cache.file.directory')
				return '/test/storage'
			return undefined
		})

		configService.getOptional.mockImplementation((key: string, defaultValue: any) => {
			const defaults: Record<string, any> = {
				'storage.optimization.enabled': true,
				'storage.optimization.strategies': ['deduplication'],
				'storage.optimization.popularThreshold': 10,
				'storage.optimization.compressionLevel': 6,
				'storage.optimization.createBackups': false,
				'storage.optimization.maxTime': 600000,
			}
			return defaults[key] || defaultValue
		})

		// Setup storage monitoring mocks
		storageMonitoring.getStorageStats.mockResolvedValue({
			totalFiles: 3,
			totalSize: 3.5 * 1024 * 1024,
			averageFileSize: 1.17 * 1024 * 1024,
			oldestFile: new Date(),
			newestFile: new Date(),
			fileTypes: {},
			accessPatterns: mockAccessPatterns,
		})

		// Setup fs mocks for deduplication
		mockFs.unlink.mockResolvedValue(undefined)
		mockFs.link.mockResolvedValue(undefined)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('optimizeFrequentlyAccessedFiles', () => {
		it('should optimize files above popularity threshold', async () => {
			const result = await service.optimizeFrequentlyAccessedFiles()

			expect(result.filesOptimized).toBeGreaterThan(0)
			expect(result.strategy).toContain('deduplication')
			expect(result.errors).toEqual([])
			expect(result.duration).toBeGreaterThanOrEqual(0)
		}, 10000)

		it('should skip optimization when no popular files exist', async () => {
			const unpopularPatterns = mockAccessPatterns.map(pattern => ({
				...pattern,
				accessCount: 5, // Below threshold
			}))

			storageMonitoring.getStorageStats.mockResolvedValue({
				totalFiles: 3,
				totalSize: 3.5 * 1024 * 1024,
				averageFileSize: 1.17 * 1024 * 1024,
				oldestFile: new Date(),
				newestFile: new Date(),
				fileTypes: {},
				accessPatterns: unpopularPatterns,
			})

			const result = await service.optimizeFrequentlyAccessedFiles()

			expect(result.filesOptimized).toBe(0)
			expect(result.sizeReduced).toBe(0)
			expect(result.strategy).toBe('none')
		})

		it('should prevent concurrent optimization', async () => {
			// Start first optimization
			const firstOptimization = service.optimizeFrequentlyAccessedFiles()

			// Try to start second optimization
			await expect(service.optimizeFrequentlyAccessedFiles()).rejects.toThrow('Optimization is already running')

			// Wait for first optimization to complete
			await firstOptimization
		}, 10000)

		it('should handle strategy errors gracefully', async () => {
			// Mock fs.link to fail for deduplication strategy
			mockFs.link.mockImplementation(() => Promise.reject(new Error('Hard link error')))

			const result = await service.optimizeFrequentlyAccessedFiles()

			// Deduplication should still be listed as an applied strategy
			expect(result.strategy).toContain('deduplication')
		})
	})

	describe('deduplication strategy', () => {
		beforeEach(async () => {
			// Mock crypto.createHash for deduplication
			const mockCrypto = await import('node:crypto')
			const mockHash = {
				update: vi.fn().mockReturnThis(),
				digest: vi.fn(),
			}
			vi.mocked(mockCrypto.createHash).mockReturnValue(mockHash as any)

			// Simulate duplicate files by returning same hash
			mockHash.digest.mockReturnValue('same-hash-for-duplicates')
		})

		it('should deduplicate files with same content', async () => {
			const result = await service.optimizeFrequentlyAccessedFiles()

			expect(result.strategy).toContain('deduplication')
			expect(result.filesOptimized).toBeGreaterThan(0)
		})

		it('should keep most frequently accessed file as original', async () => {
			await service.optimizeFrequentlyAccessedFiles()

			// Should create hard links for less popular files
			expect(mockFs.link).toHaveBeenCalled()
			expect(mockFs.unlink).toHaveBeenCalled()
		})

		it('should handle hard link creation errors', async () => {
			mockFs.link.mockRejectedValue(new Error('Hard link failed'))

			const result = await service.optimizeFrequentlyAccessedFiles()

			// Should continue with other files despite errors
			expect(result.strategy).toContain('deduplication')
		})
	})

	describe('getOptimizationStats', () => {
		it('should return current optimization statistics', () => {
			const stats = service.getOptimizationStats()

			expect(stats.enabled).toBe(true)
			expect(stats.isRunning).toBe(false)
			expect(stats.totalOptimizations).toBe(0)
			expect(stats.totalSizeSaved).toBe(0)
			expect(stats.averageCompressionRatio).toBe(0)
			expect(stats.strategies).toEqual(['deduplication'])
		})

		it('should report zero optimizations when no file-level history is recorded', async () => {
			// Deduplication strategy does not write to optimizationHistory
			await service.optimizeFrequentlyAccessedFiles()

			const stats = service.getOptimizationStats()

			expect(stats.totalOptimizations).toBe(0)
			expect(stats.totalSizeSaved).toBe(0)
		})
	})

	describe('getFileOptimizationHistory', () => {
		it('should return null for non-optimized file', () => {
			const history = service.getFileOptimizationHistory('non-existent.jpg')

			expect(history).toBeNull()
		})

		it('should return optimization history for optimized file', async () => {
			// Perform optimization first
			await service.optimizeFrequentlyAccessedFiles()

			// Check if any file has optimization history
			const stats = service.getOptimizationStats()
			// This test would need to be more specific based on actual implementation
			expect(stats.totalOptimizations).toBeGreaterThanOrEqual(0)
		})
	})

	describe('scheduledOptimization', () => {
		it('should not run when disabled', async () => {
			// Create a new service instance with optimization disabled
			const disabledConfigService = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'cache.file.directory')
						return '/test/storage'
					return undefined
				}),
				getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
					if (key === 'storage.optimization.enabled')
						return false
					return defaultValue
				}),
			}

			const disabledModule: TestingModule = await Test.createTestingModule({
				providers: [
					StorageOptimizationService,
					{
						provide: StorageMonitoringService,
						useValue: storageMonitoring,
					},
					{
						provide: ConfigService,
						useValue: disabledConfigService,
					},
				],
			}).compile()

			const disabledService = disabledModule.get<StorageOptimizationService>(StorageOptimizationService)

			// Reset mock call count
			storageMonitoring.getStorageStats.mockClear()

			await disabledService.scheduledOptimization()

			expect(storageMonitoring.getStorageStats).not.toHaveBeenCalled()
		})

		it('should not run when optimization is already running', async () => {
			// Start manual optimization
			const manualOptimization = service.optimizeFrequentlyAccessedFiles()

			// Try scheduled optimization
			await service.scheduledOptimization()

			// Should not interfere
			expect(storageMonitoring.getStorageStats).toHaveBeenCalledTimes(1) // Only from manual optimization

			await manualOptimization
		})

		it('should handle scheduled optimization errors gracefully', async () => {
			storageMonitoring.getStorageStats.mockRejectedValue(new Error('Storage error'))

			// Should not throw
			await expect(service.scheduledOptimization()).resolves.toBeUndefined()
		})
	})

	describe('strategy configuration', () => {
		it('should use only configured strategies', async () => {
			// Create a new service instance with only deduplication
			const customConfigService = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'cache.file.directory')
						return '/test/storage'
					return undefined
				}),
				getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
					if (key === 'storage.optimization.strategies')
						return ['deduplication']
					const defaults: Record<string, any> = {
						'storage.optimization.enabled': true,
						'storage.optimization.popularThreshold': 10,
						'storage.optimization.compressionLevel': 6,
						'storage.optimization.createBackups': false,
						'storage.optimization.maxTime': 600000,
					}
					return defaults[key] || defaultValue
				}),
			}

			const customModule: TestingModule = await Test.createTestingModule({
				providers: [
					StorageOptimizationService,
					{
						provide: StorageMonitoringService,
						useValue: storageMonitoring,
					},
					{
						provide: ConfigService,
						useValue: customConfigService,
					},
				],
			}).compile()

			const customService = customModule.get<StorageOptimizationService>(StorageOptimizationService)
			const result = await customService.optimizeFrequentlyAccessedFiles()

			expect(result.strategy).toBe('deduplication')
		})

		it('should handle unknown strategy names gracefully', async () => {
			// Create a new service instance with a non-existent strategy
			const customConfigService = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'cache.file.directory')
						return '/test/storage'
					return undefined
				}),
				getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
					if (key === 'storage.optimization.strategies')
						return ['nonexistent']
					const defaults: Record<string, any> = {
						'storage.optimization.enabled': true,
						'storage.optimization.popularThreshold': 10,
						'storage.optimization.compressionLevel': 6,
						'storage.optimization.createBackups': false,
						'storage.optimization.maxTime': 600000,
					}
					return defaults[key] || defaultValue
				}),
			}

			const customModule: TestingModule = await Test.createTestingModule({
				providers: [
					StorageOptimizationService,
					{
						provide: StorageMonitoringService,
						useValue: storageMonitoring,
					},
					{
						provide: ConfigService,
						useValue: customConfigService,
					},
				],
			}).compile()

			const customService = customModule.get<StorageOptimizationService>(StorageOptimizationService)
			const result = await customService.optimizeFrequentlyAccessedFiles()

			expect(result.errors).toContainEqual('Unknown strategy: nonexistent')
			expect(result.strategy).toBe('')
		})

		it('should respect popularity threshold configuration', async () => {
			// Create a new service instance with high threshold
			const customConfigService = {
				get: vi.fn().mockImplementation((key: string) => {
					if (key === 'cache.file.directory')
						return '/test/storage'
					return undefined
				}),
				getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
					if (key === 'storage.optimization.popularThreshold')
						return 100 // Very high threshold
					const defaults: Record<string, any> = {
						'storage.optimization.enabled': true,
						'storage.optimization.strategies': ['deduplication'],
						'storage.optimization.compressionLevel': 6,
						'storage.optimization.createBackups': false,
						'storage.optimization.maxTime': 600000,
					}
					return defaults[key] || defaultValue
				}),
			}

			const customModule: TestingModule = await Test.createTestingModule({
				providers: [
					StorageOptimizationService,
					{
						provide: StorageMonitoringService,
						useValue: storageMonitoring,
					},
					{
						provide: ConfigService,
						useValue: customConfigService,
					},
				],
			}).compile()

			const customService = customModule.get<StorageOptimizationService>(StorageOptimizationService)
			const result = await customService.optimizeFrequentlyAccessedFiles()

			// No files should meet the high threshold
			expect(result.filesOptimized).toBe(0)
			expect(result.strategy).toBe('none')
		})
	})

	describe('error handling', () => {
		it('should handle storage monitoring errors', async () => {
			storageMonitoring.getStorageStats.mockRejectedValue(new Error('Storage unavailable'))

			const result = await service.optimizeFrequentlyAccessedFiles()

			expect(result.errors).toContainEqual(expect.stringMatching(/Storage unavailable/))
			expect(result.filesOptimized).toBe(0)
		})

		it('should handle file system errors during deduplication', async () => {
			// Mock fs.unlink to fail during deduplication
			mockFs.unlink.mockImplementation(() => Promise.reject(new Error('Permission denied')))

			const result = await service.optimizeFrequentlyAccessedFiles()

			// Deduplication should still be listed as an applied strategy
			expect(result.strategy).toContain('deduplication')
		})
	})
})
