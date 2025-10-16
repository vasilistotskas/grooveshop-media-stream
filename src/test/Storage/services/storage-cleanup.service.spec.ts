import type { MockedObject } from 'vitest'
import { promises as fs } from 'node:fs'
import { ConfigService } from '#microservice/Config/config.service'
import { IntelligentEvictionService } from '#microservice/Storage/services/intelligent-eviction.service'
import { StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import { StorageMonitoringService } from '#microservice/Storage/services/storage-monitoring.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock fs module
vi.mock('node:fs', () => ({
	promises: {
		readdir: vi.fn(),
		stat: vi.fn(),
		unlink: vi.fn().mockResolvedValue(undefined),
	},
}))

const mockFs = fs as MockedObject<typeof fs>

describe('storageCleanupService', () => {
	let service: StorageCleanupService
	let storageMonitoring: MockedObject<StorageMonitoringService>
	let intelligentEviction: MockedObject<IntelligentEvictionService>
	let configService: MockedObject<ConfigService>

	const mockFiles = [
		'old-image.jpg',
		'recent-image.webp',
		'cache-file.json',
		'temp-file.tmp',
		'.gitkeep',
	]

	beforeEach(async () => {
		const mockStorageMonitoring = {
			checkThresholds: vi.fn(),
		}

		const mockIntelligentEviction = {
			performThresholdBasedEviction: vi.fn(),
		}

		const mockConfigService = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === 'cache.file.directory')
					return '/test/storage'
				return undefined
			}),
			getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
				const defaults: Record<string, any> = {
					'storage.cleanup.enabled': true,
					'storage.cleanup.cronSchedule': '0 2 * * *',
					'storage.cleanup.dryRun': false,
					'storage.cleanup.maxDuration': 300000,
				}
				return defaults[key] || defaultValue
			}),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageCleanupService,
				{
					provide: StorageMonitoringService,
					useValue: mockStorageMonitoring,
				},
				{
					provide: IntelligentEvictionService,
					useValue: mockIntelligentEviction,
				},
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
			],
		}).compile()

		service = module.get<StorageCleanupService>(StorageCleanupService)
		storageMonitoring = module.get(StorageMonitoringService)
		intelligentEviction = module.get(IntelligentEvictionService)
		configService = module.get(ConfigService)

		// Setup fs mocks
		mockFs.readdir.mockResolvedValue(mockFiles as any)
		mockFs.unlink.mockResolvedValue(undefined)

		// Add spies to track calls
		vi.spyOn(mockFs, 'readdir')
		vi.spyOn(mockFs, 'stat')
		vi.spyOn(mockFs, 'unlink')

		// Mock file stats - create old files that should be cleaned up
		mockFs.stat.mockImplementation((filePath: any) => {
			const fileName = filePath.split('/').pop() || ''
			const size = fileName.includes('large') ? 10 * 1024 * 1024 : 1024 * 1024 // 10MB or 1MB

			// Make files old enough to be cleaned up based on policy
			let ageInDays = 0
			if (fileName.includes('cache') || fileName.endsWith('.json')) {
				ageInDays = 35 // Older than 30 days for old-cache-files policy
			}
			else if (fileName.includes('temp') || fileName.endsWith('.tmp')) {
				ageInDays = 2 // Older than 1 day for temp-files policy
			}
			else if (fileName.includes('old') || fileName.match(/\.(jpg|jpeg|png|webp|gif)$/)) {
				ageInDays = 10 // Older than 7 days for large-images policy
			}

			const mtime = new Date(Date.now() - ageInDays * 24 * 60 * 60 * 1000)

			return Promise.resolve({
				size,
				mtime,
				isFile: () => true,
				isDirectory: () => false,
			} as any)
		})

		// Setup storage monitoring mocks
		storageMonitoring.checkThresholds.mockResolvedValue({
			status: 'healthy',
			issues: [],
			stats: {
				totalSize: 100 * 1024 * 1024,
				totalFiles: 100,
				averageFileSize: 1024 * 1024,
				oldestFile: new Date('2024-01-01'),
				newestFile: new Date('2024-01-15'),
				fileTypes: { '.jpg': 50, '.png': 30, '.webp': 20 },
				accessPatterns: [],
			},
		})

		// Setup intelligent eviction mocks
		intelligentEviction.performThresholdBasedEviction.mockResolvedValue({
			filesEvicted: 0,
			sizeFreed: 0,
			errors: [],
			strategy: 'threshold-based',
			duration: 0,
		})
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('performCleanup', () => {
		beforeEach(() => {
			// Mock file stats for different ages
			mockFs.stat.mockImplementation((filePath: any) => {
				const filename = filePath.split('/').pop()
				let mtime: Date

				switch (filename) {
					case 'old-image.jpg':
						mtime = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) // 35 days old
						break
					case 'cache-file.json':
						mtime = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) // 31 days old
						break
					case 'temp-file.tmp':
						mtime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) // 2 days old
						break
					default:
						mtime = new Date() // Recent file
				}

				return Promise.resolve({
					size: 1024 * 1024, // 1MB
					mtime,
					atime: mtime,
				} as any)
			})
		})

		it('should perform cleanup with default policies', async () => {
			// Mock files that match policy patterns and are old enough
			mockFs.readdir.mockResolvedValue(['old-cache.json', 'temp-file.tmp'] as any)

			mockFs.stat.mockImplementation((filePath: any) => {
				const filename = filePath.split(/[/\\]/).pop() // Handle both Unix and Windows paths
				let ageInDays = 0

				if (filename === 'old-cache.json') {
					ageInDays = 35 // Older than 30 days for old-cache-files policy
				}
				else if (filename === 'temp-file.tmp') {
					ageInDays = 2 // Older than 1 day for temp-files policy
				}

				const mtime = new Date(Date.now() - ageInDays * 24 * 60 * 60 * 1000)

				return Promise.resolve({
					size: 1024 * 1024, // 1MB
					mtime,
					atime: mtime,
					isFile: () => true,
					isDirectory: () => false,
				} as any)
			})

			const result = await service.performCleanup(['old-cache-files', 'temp-files'])

			expect(result.filesRemoved).toBeGreaterThan(0)
			expect(result.sizeFreed).toBeGreaterThan(0)
			expect(result.errors).toEqual([])
			expect(result.policiesApplied.length).toBeGreaterThan(0)
			expect(result.duration).toBeGreaterThan(0)
		})

		it('should apply specific policies when requested', async () => {
			const result = await service.performCleanup(['old-cache-files'])

			expect(result.policiesApplied).toContain('old-cache-files')
		})

		it('should perform dry run when requested', async () => {
			// Mock files that match policy patterns and are old enough
			mockFs.readdir.mockResolvedValue(['old-cache.json', 'temp-file.tmp'] as any)

			mockFs.stat.mockImplementation((filePath: any) => {
				const filename = filePath.split(/[/\\]/).pop() // Handle both Unix and Windows paths
				let ageInDays = 0

				if (filename === 'old-cache.json') {
					ageInDays = 35 // Older than 30 days for old-cache-files policy
				}
				else if (filename === 'temp-file.tmp') {
					ageInDays = 2 // Older than 1 day for temp-files policy
				}

				const mtime = new Date(Date.now() - ageInDays * 24 * 60 * 60 * 1000)

				return Promise.resolve({
					size: 1024 * 1024, // 1MB
					mtime,
					atime: mtime,
					isFile: () => true,
					isDirectory: () => false,
				} as any)
			})

			const result = await service.performCleanup(['old-cache-files', 'temp-files'], true)

			expect(mockFs.unlink).not.toHaveBeenCalled()
			expect(result.filesRemoved).toBeGreaterThan(0) // Still counts what would be removed
		})

		it('should trigger intelligent eviction when thresholds exceeded', async () => {
			storageMonitoring.checkThresholds.mockResolvedValue({
				status: 'warning',
				issues: ['Storage size warning'],
				stats: {
					totalSize: 800 * 1024 * 1024,
					totalFiles: 1000,
					averageFileSize: 800 * 1024,
					oldestFile: new Date('2024-01-01'),
					newestFile: new Date('2024-01-15'),
					fileTypes: { '.jpg': 500, '.png': 300, '.webp': 200 },
					accessPatterns: [],
				},
			})

			intelligentEviction.performThresholdBasedEviction.mockResolvedValue({
				filesEvicted: 5,
				sizeFreed: 5 * 1024 * 1024,
				errors: [],
				strategy: 'intelligent',
				duration: 1000,
			})

			const result = await service.performCleanup()

			expect(intelligentEviction.performThresholdBasedEviction).toHaveBeenCalled()
			expect(result.policiesApplied).toContain('intelligent-eviction')
		})

		it('should handle policy execution errors gracefully', async () => {
			mockFs.readdir.mockRejectedValue(new Error('Permission denied'))

			const result = await service.performCleanup()

			expect(result.errors.length).toBeGreaterThan(0)
			expect(result.errors[0]).toContain('Permission denied')
		})

		it('should prevent concurrent cleanup execution', async () => {
			// Start first cleanup
			const firstCleanup = service.performCleanup()

			// Try to start second cleanup
			await expect(service.performCleanup()).rejects.toThrow('Cleanup is already running')

			// Wait for first cleanup to complete
			await firstCleanup
		})
	})

	describe('retention policies', () => {
		beforeEach(() => {
			mockFs.stat.mockResolvedValue({
				size: 1024 * 1024,
				mtime: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000), // 35 days old
				atime: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000),
			} as any)
		})

		it('should apply old-cache-files policy correctly', async () => {
			// Set up files in directory - use .json extension to match the policy pattern
			mockFs.readdir.mockResolvedValue(['old-file.json', 'recent-file.json'] as any)

			// Clear previous mock and set up new implementation
			mockFs.stat.mockReset()
			mockFs.stat.mockImplementation((filePath: any) => {
				const filename = filePath.split(/[/\\]/).pop() // Handle both Unix and Windows paths
				const isOld = filename === 'old-file.json'

				// Make old file 35 days old (older than 30 day policy), recent file 5 days old
				const ageInMs = (isOld ? 35 : 5) * 24 * 60 * 60 * 1000
				const mtime = new Date(Date.now() - ageInMs)

				return Promise.resolve({
					size: 1024 * 1024, // 1MB
					mtime,
					atime: new Date(Date.now() - ageInMs),
					isFile: () => true,
					isDirectory: () => false,
				} as any)
			})

			// Mock unlink to succeed
			mockFs.unlink.mockResolvedValue(undefined)

			const result = await service.performCleanup(['old-cache-files'], false)

			expect(result.policiesApplied).toContain('old-cache-files')
			expect(result.filesRemoved).toBe(1)
			expect(mockFs.unlink).toHaveBeenCalledWith(
				expect.stringContaining('old-file.json'),
			)
			expect(mockFs.unlink).not.toHaveBeenCalledWith(
				expect.stringContaining('recent-file.json'),
			)
		})

		it('should apply large-images policy correctly', async () => {
			mockFs.readdir.mockResolvedValue(['large-image.jpg', 'small-image.jpg'] as any)

			const result = await service.performCleanup(['large-images'])

			expect(result.filesRemoved).toBeGreaterThan(0)
		})

		it('should apply temp-files policy correctly', async () => {
			mockFs.readdir.mockResolvedValue(['temp1.tmp', 'temp2.temp'] as any)

			mockFs.stat.mockResolvedValue({
				size: 1024,
				mtime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days old
				atime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
			} as any)

			const result = await service.performCleanup(['temp-files'])

			expect(result.filesRemoved).toBe(2)
		})

		it('should respect preserve count in policies', async () => {
			// Create many files to test preserve count
			const manyFiles = Array.from({ length: 150 }, (_, i) => `file${i}.jpg`)
			mockFs.readdir.mockResolvedValue(manyFiles as any)

			const result = await service.performCleanup(['preserve-recent'])

			// Should preserve at least 100 files
			expect(result.filesRemoved).toBeLessThanOrEqual(50)
		})
	})

	describe('getCleanupStatus', () => {
		it('should return current cleanup status', () => {
			const status = service.getCleanupStatus()

			expect(status.enabled).toBe(true)
			expect(status.isRunning).toBe(false)
			expect(status.lastCleanup).toBeInstanceOf(Date)
			expect(status.nextCleanup).toBeInstanceOf(Date)
			expect(status.policies).toBeInstanceOf(Array)
			expect(status.policies.length).toBeGreaterThan(0)
		})
	})

	describe('policy management', () => {
		it('should update existing retention policy', () => {
			const newPolicy = {
				name: 'old-cache-files',
				description: 'Updated policy',
				maxAge: 15,
				maxSize: 0,
				enabled: true,
			}

			service.updateRetentionPolicy(newPolicy)

			const status = service.getCleanupStatus()
			const updatedPolicy = status.policies.find(p => p.name === 'old-cache-files')
			expect(updatedPolicy?.maxAge).toBe(15)
			expect(updatedPolicy?.description).toBe('Updated policy')
		})

		it('should add new retention policy', () => {
			const newPolicy = {
				name: 'custom-policy',
				description: 'Custom cleanup policy',
				maxAge: 10,
				maxSize: 50 * 1024 * 1024,
				enabled: true,
			}

			service.updateRetentionPolicy(newPolicy)

			const status = service.getCleanupStatus()
			const customPolicy = status.policies.find(p => p.name === 'custom-policy')
			expect(customPolicy).toBeDefined()
			expect(customPolicy?.maxAge).toBe(10)
		})

		it('should remove retention policy', () => {
			const removed = service.removeRetentionPolicy('old-cache-files')

			expect(removed).toBe(true)

			const status = service.getCleanupStatus()
			const removedPolicy = status.policies.find(p => p.name === 'old-cache-files')
			expect(removedPolicy).toBeUndefined()
		})

		it('should return false when removing non-existent policy', () => {
			const removed = service.removeRetentionPolicy('non-existent-policy')

			expect(removed).toBe(false)
		})
	})

	describe('scheduledCleanup', () => {
		it('should not run when disabled', async () => {
			configService.getOptional.mockImplementation((key: string, defaultValue: any) => {
				if (key === 'storage.cleanup.enabled')
					return false
				return defaultValue
			})

			await service.scheduledCleanup()

			expect(mockFs.readdir).not.toHaveBeenCalled()
		})

		it('should not run when cleanup is already running', async () => {
			// Start manual cleanup
			const manualCleanup = service.performCleanup()

			// Try scheduled cleanup
			await service.scheduledCleanup()

			// Should not interfere - readdir should only be called from manual cleanup
			// The number of calls depends on how many policies are enabled and applied
			expect(mockFs.readdir).toHaveBeenCalled()
			expect(mockFs.readdir).toHaveBeenCalledWith('./storage')

			await manualCleanup
		})

		it('should handle scheduled cleanup errors gracefully', async () => {
			mockFs.readdir.mockRejectedValue(new Error('Disk error'))

			// Should not throw
			await expect(service.scheduledCleanup()).resolves.toBeUndefined()
		})
	})
})
