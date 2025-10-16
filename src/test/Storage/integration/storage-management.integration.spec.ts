import type { MockedObject } from 'vitest'
import { Buffer } from 'node:buffer'
import { promises as fs } from 'node:fs'
import { ConfigService } from '#microservice/Config/config.service'
import { StorageHealthIndicator } from '#microservice/Storage/indicators/storage-health.indicator'
import { IntelligentEvictionService } from '#microservice/Storage/services/intelligent-eviction.service'
import { StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import { StorageMonitoringService } from '#microservice/Storage/services/storage-monitoring.service'
import { StorageOptimizationService } from '#microservice/Storage/services/storage-optimization.service'
import { StorageModule } from '#microservice/Storage/storage.module'
import { Test, TestingModule } from '@nestjs/testing'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock fs module for integration tests
vi.mock('node:fs', () => ({
	promises: {
		readdir: vi.fn(),
		stat: vi.fn(),
		unlink: vi.fn(),
		mkdir: vi.fn(),
		readFile: vi.fn(),
		writeFile: vi.fn(),
		copyFile: vi.fn(),
		link: vi.fn(),
	},
	existsSync: vi.fn().mockReturnValue(true),
	readFileSync: vi.fn().mockReturnValue(''),
}))

const mockFs = fs as MockedObject<typeof fs>

describe('storage Management Integration', () => {
	let module: TestingModule
	let storageMonitoring: StorageMonitoringService
	let intelligentEviction: IntelligentEvictionService
	let storageCleanup: StorageCleanupService
	let storageOptimization: StorageOptimizationService
	let storageHealth: StorageHealthIndicator

	const testStorageDir = '/test/storage'
	const mockFiles = [
		'popular-image.webp',
		'old-cache.json',
		'recent-image.jpg',
		'temp-file.tmp',
		'large-image.png',
	]

	beforeAll(async () => {
		const mockConfigService = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'cache.file.directory')
					return testStorageDir
				return undefined
			}),
			getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
				const defaults = {
					// Storage monitoring
					'storage.warningSize': 800 * 1024 * 1024,
					'storage.criticalSize': 1024 * 1024 * 1024,
					'storage.warningFileCount': 5000,
					'storage.criticalFileCount': 10000,
					'storage.maxFileAge': 30,

					// Eviction
					'storage.eviction.strategy': 'intelligent',
					'storage.eviction.aggressiveness': 'moderate',
					'storage.eviction.preservePopular': true,
					'storage.eviction.minAccessCount': 5,
					'storage.eviction.maxFileAge': 7,

					// Cleanup
					'storage.cleanup.enabled': true,
					'storage.cleanup.cronSchedule': '0 2 * * *',
					'storage.cleanup.dryRun': false,
					'storage.cleanup.maxDuration': 300000,

					// Optimization
					'storage.optimization.enabled': true,
					'storage.optimization.strategies': ['compression', 'deduplication'],
					'storage.optimization.popularityThreshold': 10,
					'storage.optimization.compressionRatio': 0.7,
					'storage.optimization.createBackups': true,
				}
				return (defaults as any)[key] || defaultValue
			}),
		}

		module = await Test.createTestingModule({
			imports: [StorageModule],
		})
			.overrideProvider(ConfigService)
			.useValue(mockConfigService)
			.compile()

		storageMonitoring = module.get<StorageMonitoringService>(StorageMonitoringService)
		intelligentEviction = module.get<IntelligentEvictionService>(IntelligentEvictionService)
		storageCleanup = module.get<StorageCleanupService>(StorageCleanupService)
		storageOptimization = module.get<StorageOptimizationService>(StorageOptimizationService)
		storageHealth = module.get<StorageHealthIndicator>(StorageHealthIndicator)

		// Setup fs mocks
		mockFs.mkdir.mockResolvedValue(undefined)
		mockFs.readdir.mockResolvedValue(mockFiles as any)
		mockFs.unlink.mockResolvedValue(undefined)
		mockFs.readFile.mockResolvedValue(Buffer.from('test file content'))
		mockFs.writeFile.mockResolvedValue(undefined)
		mockFs.copyFile.mockResolvedValue(undefined)
		mockFs.link.mockResolvedValue(undefined)
	})

	beforeEach(() => {
		vi.clearAllMocks()

		// Setup file stats with different characteristics
		mockFs.stat.mockImplementation((filePath: any) => {
			const filename = filePath.split(/[/\\]/).pop()
			let stats: any

			switch (filename) {
				case 'popular-image.webp':
					stats = {
						size: 2 * 1024 * 1024, // 2MB
						mtime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days old
						atime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Accessed 1 day ago
					}
					break
				case 'old-cache.json':
					stats = {
						size: 512 * 1024, // 512KB
						mtime: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000), // 25 days old (within 30 day threshold)
						atime: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
					}
					break
				case 'recent-image.jpg':
					stats = {
						size: 1024 * 1024, // 1MB
						mtime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days old
						atime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
					}
					break
				case 'temp-file.tmp':
					stats = {
						size: 256 * 1024, // 256KB
						mtime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days old
						atime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
					}
					break
				case 'large-image.png':
					stats = {
						size: 5 * 1024 * 1024, // 5MB
						mtime: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), // 10 days old
						atime: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
					}
					break
				default:
					stats = {
						size: 1024 * 1024,
						mtime: new Date(),
						atime: new Date(),
					}
			}

			return Promise.resolve(stats)
		})
	})

	afterAll(async () => {
		await module.close()
	})

	describe('end-to-End Storage Management Workflow', () => {
		it('should perform complete storage management cycle', async () => {
			// 1. Monitor storage and get initial stats
			const initialStats = await storageMonitoring.getStorageStats()
			expect(initialStats.totalFiles).toBe(5)
			expect(initialStats.totalSize).toBe(8.75 * 1024 * 1024) // Total of all file sizes

			// 2. Check storage thresholds
			const thresholdCheck = await storageMonitoring.checkThresholds()
			expect(thresholdCheck.status).toBe('healthy') // Should be healthy with test data

			// 3. Get eviction candidates
			const evictionCandidates = await storageMonitoring.getEvictionCandidates(2 * 1024 * 1024) // 2MB target
			expect(evictionCandidates.length).toBeGreaterThan(0)

			// 4. Perform intelligent eviction
			const evictionResult = await intelligentEviction.performEviction(1 * 1024 * 1024) // 1MB target
			expect(evictionResult.filesEvicted).toBeGreaterThan(0)
			expect(evictionResult.sizeFreed).toBeGreaterThan(0)

			// 5. Run cleanup with retention policies
			const cleanupResult = await storageCleanup.performCleanup()
			expect(cleanupResult.filesRemoved).toBeGreaterThan(0)
			expect(cleanupResult.policiesApplied.length).toBeGreaterThan(0)

			// 6. Optimize frequently accessed files
			// First, simulate popular files by recording access
			storageMonitoring.recordFileAccess('popular-image.webp')
			for (let i = 0; i < 15; i++) {
				storageMonitoring.recordFileAccess('popular-image.webp')
			}

			const optimizationResult = await storageOptimization.optimizeFrequentlyAccessedFiles()
			expect(optimizationResult.strategy).toBeDefined()

			// 7. Check final health status
			const healthResult = await storageHealth.isHealthy()
			expect(healthResult.storage).toBeDefined()
			expect(healthResult.storage.status).toMatch(/up|down/)
		})

		it('should handle storage threshold escalation', async () => {
			// Simulate high storage usage
			mockFs.stat.mockResolvedValue({
				size: 200 * 1024 * 1024, // 200MB per file
				mtime: new Date(),
				atime: new Date(),
			} as any)

			// Check thresholds - should be warning/critical
			const thresholdCheck = await storageMonitoring.checkThresholds()
			expect(['warning', 'critical']).toContain(thresholdCheck.status)

			// Perform threshold-based eviction
			const evictionResult = await intelligentEviction.performThresholdBasedEviction()

			if (thresholdCheck.status === 'critical') {
				expect(evictionResult.filesEvicted).toBeGreaterThan(0)
			}

			// Health check should reflect the situation
			const healthResult = await storageHealth.isHealthy()
			if (thresholdCheck.status === 'critical') {
				expect(healthResult.storage.status).toBe('down')
			}
		})

		it('should coordinate cleanup and optimization', async () => {
			// Record access patterns to create popular files
			for (let i = 0; i < 20; i++) {
				storageMonitoring.recordFileAccess('popular-image.webp')
			}
			for (let i = 0; i < 15; i++) {
				storageMonitoring.recordFileAccess('recent-image.jpg')
			}

			// Run cleanup first
			const cleanupResult = await storageCleanup.performCleanup()

			// Then optimize remaining popular files
			const optimizationResult = await storageOptimization.optimizeFrequentlyAccessedFiles()

			// Both should have processed files
			expect(cleanupResult.filesRemoved + optimizationResult.filesOptimized).toBeGreaterThan(0)

			// Get final storage analysis
			const analysis = await storageHealth.getStorageAnalysis()
			expect(analysis.stats).toBeDefined()
			expect(analysis.evictionCandidates).toBeDefined()
			expect(analysis.cleanupRecommendations).toBeDefined()
		})
	})

	describe('service Integration', () => {
		it('should share access pattern data between services', async () => {
			// Record access in monitoring service
			storageMonitoring.recordFileAccess('popular-image.webp')
			storageMonitoring.recordFileAccess('popular-image.webp')

			// Get stats to update patterns
			await storageMonitoring.getStorageStats()

			// Eviction service should see the access patterns
			const evictionCandidates = await storageMonitoring.getEvictionCandidates()
			const popularFile = evictionCandidates.find(c => c.file === 'popular-image.webp')

			if (popularFile) {
				expect(popularFile.accessCount).toBeGreaterThan(1)
			}
		})

		it('should provide consistent health reporting', async () => {
			// Get health status
			const healthResult = await storageHealth.isHealthy()

			// Get detailed analysis
			const analysis = await storageHealth.getStorageAnalysis()

			// Both should reflect same underlying data
			expect(healthResult.storage.totalFiles).toBe(analysis.stats.totalFiles)
			expect(healthResult.storage.recommendations).toBeDefined()
		})

		it('should handle service dependencies correctly', async () => {
			// Cleanup service depends on monitoring and eviction
			const cleanupStatus = storageCleanup.getCleanupStatus()
			expect(cleanupStatus.enabled).toBe(true)

			// Health indicator depends on monitoring and cleanup
			const healthResult = await storageHealth.isHealthy()
			expect(healthResult.storage.cleanupStatus).toBeDefined()

			// Optimization depends on monitoring
			const optimizationStats = storageOptimization.getOptimizationStats()
			expect(optimizationStats.enabled).toBe(true)
		})
	})

	describe('error Handling and Resilience', () => {
		it('should handle file system errors gracefully', async () => {
			// Simulate file system errors
			mockFs.readdir.mockRejectedValueOnce(new Error('Permission denied'))
			mockFs.stat.mockRejectedValueOnce(new Error('File not found'))

			// Services should handle errors without crashing
			await expect(storageMonitoring.getStorageStats()).rejects.toThrow()

			// But other operations should still work
			const cleanupStatus = storageCleanup.getCleanupStatus()
			expect(cleanupStatus).toBeDefined()
		})

		it('should maintain service availability during partial failures', async () => {
			// Simulate partial failures
			mockFs.unlink.mockRejectedValueOnce(new Error('Permission denied'))

			// Cleanup should continue with other files
			const cleanupResult = await storageCleanup.performCleanup()
			expect(cleanupResult.errors.length).toBeGreaterThan(0)
			expect(cleanupResult.filesRemoved).toBeGreaterThanOrEqual(0)

			// Health check should still work
			const healthResult = await storageHealth.isHealthy()
			expect(healthResult.storage).toBeDefined()
		})

		it('should provide meaningful error reporting', async () => {
			// Simulate various error conditions
			mockFs.stat.mockRejectedValue(new Error('Disk full'))

			try {
				await storageMonitoring.getStorageStats()
			}
			catch (error) {
				expect((error as any).message).toContain('Disk full')
			}

			// Health check should reflect the error
			const healthResult = await storageHealth.isHealthy()
			expect(healthResult.storage.status).toBe('down')
			expect(healthResult.storage.message).toContain('Disk full')
		})
	})

	describe('performance and Scalability', () => {
		it('should handle large numbers of files efficiently', async () => {
			// Simulate many files
			const manyFiles = Array.from({ length: 1000 }, (_, i) => `file${i}.jpg`)
			mockFs.readdir.mockResolvedValue(manyFiles as any)

			const startTime = Date.now()
			const stats = await storageMonitoring.getStorageStats()
			const duration = Date.now() - startTime

			expect(stats.totalFiles).toBe(1000)
			expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
		})

		it('should limit resource usage during optimization', async () => {
			// Optimization should respect time limits
			const optimizationStats = storageOptimization.getOptimizationStats()
			expect(optimizationStats.enabled).toBe(true)

			// Should not run concurrent optimizations
			const firstOptimization = storageOptimization.optimizeFrequentlyAccessedFiles()
			await expect(storageOptimization.optimizeFrequentlyAccessedFiles()).rejects.toThrow('already running')

			await firstOptimization
		})
	})
})
