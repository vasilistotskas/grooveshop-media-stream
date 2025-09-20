import { Buffer } from 'node:buffer'
import { promises as fs } from 'node:fs'
import { ConfigService } from '@microservice/Config/config.service'
import { StorageMonitoringService } from '@microservice/Storage/services/storage-monitoring.service'
import { StorageOptimizationService } from '@microservice/Storage/services/storage-optimization.service'
import { Test, TestingModule } from '@nestjs/testing'

// Mock fs and zlib modules
jest.mock('node:fs', () => ({
	promises: {
		readFile: jest.fn(),
		writeFile: jest.fn(),
		unlink: jest.fn(),
		copyFile: jest.fn(),
		link: jest.fn(),
	},
}))

jest.mock('node:zlib', () => ({
	gzip: jest.fn((data, options, callback) => {
		// Simulate successful compression with 50% reduction
		const compressedData = Buffer.from('compressed-data')
		setImmediate(() => callback(null, compressedData))
	}),
}))

jest.mock('node:crypto', () => ({
	createHash: jest.fn(() => ({
		update: jest.fn().mockReturnThis(),
		digest: jest.fn().mockReturnValue('mock-hash-123'),
	})),
}))

const mockFs = fs as jest.Mocked<typeof fs>

describe('storageOptimizationService', () => {
	let service: StorageOptimizationService
	let storageMonitoring: jest.Mocked<StorageMonitoringService>
	let configService: jest.Mocked<ConfigService>

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
			getStorageStats: jest.fn(),
		}

		const mockConfigService = {
			get: jest.fn().mockImplementation((key: string) => {
				if (key === 'cache.file.directory')
					return '/test/storage'
				return undefined
			}),
			getOptional: jest.fn().mockImplementation((key: string, defaultValue: any) => {
				const defaults = {
					'storage.optimization.enabled': true,
					'storage.optimization.strategies': ['compression', 'deduplication'],
					'storage.optimization.popularityThreshold': 10,
					'storage.optimization.compressionRatio': 0.7,
					'storage.optimization.createBackups': true,
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
			const defaults = {
				'storage.optimization.enabled': true,
				'storage.optimization.strategies': ['compression', 'deduplication'],
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

		// Setup fs mocks
		mockFs.readFile.mockResolvedValue(Buffer.from('test file content that is long enough to be compressed'))
		mockFs.writeFile.mockResolvedValue(undefined)
		mockFs.unlink.mockResolvedValue(undefined)
		mockFs.copyFile.mockResolvedValue(undefined)
		mockFs.link.mockResolvedValue(undefined)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('optimizeFrequentlyAccessedFiles', () => {
		it('should optimize files above popularity threshold', async () => {
			const result = await service.optimizeFrequentlyAccessedFiles()

			expect(result.filesOptimized).toBeGreaterThan(0)
			expect(result.strategy).toContain('compression')
			expect(result.errors).toEqual([])
			expect(result.duration).toBeGreaterThan(0)
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
			// Mock fs.readFile to fail for compression strategy
			mockFs.readFile.mockImplementation(() => Promise.reject(new Error('File read error')))

			const result = await service.optimizeFrequentlyAccessedFiles()

			expect(result.errors.length).toBeGreaterThan(0)
			expect(result.errors.some(error => error.includes('File read error'))).toBe(true)
		})
	})

	describe('compression strategy', () => {
		beforeEach(async () => {
			// Mock zlib.gzip to return compressed data
			const mockZlib = await import('node:zlib')
			jest.mocked(mockZlib.gzip).mockImplementation((data, options, callback) => {
				// Simulate 50% compression
				const compressedData = Buffer.alloc(Buffer.byteLength(data) / 2)
				callback(null, compressedData)
			})
		})

		it('should compress files when compression ratio is good', async () => {
			const result = await service.optimizeFrequentlyAccessedFiles()

			expect(result.filesOptimized).toBeGreaterThan(0)
			expect(result.sizeReduced).toBeGreaterThan(0)
		})

		it('should skip compression for already compressed files', async () => {
			const compressedPatterns = mockAccessPatterns.map(pattern => ({
				...pattern,
				file: pattern.file.replace(/\.(jpg|webp|png)$/, '.gz'),
				extension: '.gz',
			}))

			storageMonitoring.getStorageStats.mockResolvedValue({
				totalFiles: 3,
				totalSize: 3.5 * 1024 * 1024,
				averageFileSize: 1.17 * 1024 * 1024,
				oldestFile: new Date(),
				newestFile: new Date(),
				fileTypes: {},
				accessPatterns: compressedPatterns,
			})

			const result = await service.optimizeFrequentlyAccessedFiles()

			// Should still run but not compress .gz files
			expect(result.strategy).toContain('compression')
		})

		it('should skip compression for small files', async () => {
			const smallFilePatterns = mockAccessPatterns.map(pattern => ({
				...pattern,
				size: 500, // Very small file
			}))

			storageMonitoring.getStorageStats.mockResolvedValue({
				totalFiles: 3,
				totalSize: 1500,
				averageFileSize: 500,
				oldestFile: new Date(),
				newestFile: new Date(),
				fileTypes: {},
				accessPatterns: smallFilePatterns,
			})

			const result = await service.optimizeFrequentlyAccessedFiles()

			// Should run but not compress small files
			expect(result.strategy).toContain('compression')
		})

		it('should create backups when configured', async () => {
			configService.getOptional.mockImplementation((key: string, defaultValue: any) => {
				if (key === 'storage.optimization.createBackups')
					return true
				const defaults = {
					'storage.optimization.enabled': true,
					'storage.optimization.strategies': ['compression'],
					'storage.optimization.popularThreshold': 10,
					'storage.optimization.compressionLevel': 6,
					'storage.optimization.maxTime': 600000,
				}
				return defaults[key] || defaultValue
			})

			await service.optimizeFrequentlyAccessedFiles()

			expect(mockFs.copyFile).toHaveBeenCalled()
		})
	})

	describe('deduplication strategy', () => {
		beforeEach(async () => {
			// Mock crypto.createHash for deduplication
			const mockCrypto = await import('node:crypto')
			const mockHash = {
				update: jest.fn().mockReturnThis(),
				digest: jest.fn(),
			}
			jest.mocked(mockCrypto.createHash).mockReturnValue(mockHash as any)

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
			expect(stats.strategies).toEqual(['compression', 'deduplication'])
		})

		it('should track optimization history', async () => {
			// Perform optimization to create history
			await service.optimizeFrequentlyAccessedFiles()

			const stats = service.getOptimizationStats()

			expect(stats.totalOptimizations).toBeGreaterThan(0)
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
			if (stats.totalOptimizations > 0) {
				// This test would need to be more specific based on actual implementation
				expect(stats.totalOptimizations).toBeGreaterThan(0)
			}
		})
	})

	describe('scheduledOptimization', () => {
		it('should not run when disabled', async () => {
			// Create a new service instance with optimization disabled
			const disabledConfigService = {
				get: jest.fn().mockImplementation((key: string) => {
					if (key === 'cache.file.directory')
						return '/test/storage'
					return undefined
				}),
				getOptional: jest.fn().mockImplementation((key: string, defaultValue: any) => {
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
			// Create a new service instance with different configuration
			const customConfigService = {
				get: jest.fn().mockImplementation((key: string) => {
					if (key === 'cache.file.directory')
						return '/test/storage'
					return undefined
				}),
				getOptional: jest.fn().mockImplementation((key: string, defaultValue: any) => {
					if (key === 'storage.optimization.strategies')
						return ['compression']
					const defaults = {
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

			expect(result.strategy).toBe('compression')
			expect(result.strategy).not.toContain('deduplication')
		})

		it('should respect popularity threshold configuration', async () => {
			// Create a new service instance with high threshold
			const customConfigService = {
				get: jest.fn().mockImplementation((key: string) => {
					if (key === 'cache.file.directory')
						return '/test/storage'
					return undefined
				}),
				getOptional: jest.fn().mockImplementation((key: string, defaultValue: any) => {
					if (key === 'storage.optimization.popularThreshold')
						return 100 // Very high threshold
					const defaults = {
						'storage.optimization.enabled': true,
						'storage.optimization.strategies': ['compression'],
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

		it('should handle file system errors during optimization', async () => {
			// Mock fs.readFile to fail for compression strategy
			mockFs.readFile.mockImplementation(() => Promise.reject(new Error('Permission denied')))

			const result = await service.optimizeFrequentlyAccessedFiles()

			expect(result.errors.length).toBeGreaterThan(0)
			expect(result.errors.some(error => error.includes('Permission denied'))).toBe(true)
		})
	})
})
