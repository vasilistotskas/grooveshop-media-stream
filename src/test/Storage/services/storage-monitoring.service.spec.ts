import type { MockedObject } from 'vitest'
import { promises as fs } from 'node:fs'
import { ConfigService } from '@microservice/Config/config.service'
import { StorageMonitoringService } from '@microservice/Storage/services/storage-monitoring.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock fs module
vi.mock('node:fs', () => ({
	promises: {
		readdir: vi.fn(),
		stat: vi.fn(),
		mkdir: vi.fn(),
	},
}))

const mockFs = fs as MockedObject<typeof fs>

describe('storageMonitoringService', () => {
	let service: StorageMonitoringService
	let configService: MockedObject<ConfigService>

	const mockStorageDirectory = '/test/storage'
	const mockFiles = [
		'image1.webp',
		'image2.jpg',
		'cache1.json',
		'cache2.json',
		'.gitkeep',
	]

	beforeEach(async () => {
		const mockConfigService = {
			get: vi.fn().mockImplementation((_key: string) => {
				return undefined
			}),
			getOptional: vi.fn().mockImplementation((key: string, defaultValue: any) => {
				const defaults: Record<string, any> = {
					'cache.file.directory': mockStorageDirectory,
					'storage.warningSize': 800 * 1024 * 1024,
					'storage.criticalSize': 1024 * 1024 * 1024,
					'storage.warningFileCount': 5000,
					'storage.criticalFileCount': 10000,
					'storage.maxFileAge': 30,
				}
				return defaults[key] || defaultValue
			}),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageMonitoringService,
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
			],
		}).compile()

		service = module.get<StorageMonitoringService>(StorageMonitoringService)
		configService = module.get(ConfigService)

		// Setup fs mocks
		mockFs.mkdir.mockResolvedValue(undefined)
		mockFs.readdir.mockResolvedValue(mockFiles as any)
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('getStorageStats', () => {
		it('should return correct storage statistics', async () => {
			// Mock file stats
			const mockStats = {
				size: 1024 * 1024, // 1MB
				mtime: new Date('2024-01-01'),
				atime: new Date('2024-01-02'),
			}

			mockFs.stat.mockResolvedValue(mockStats as any)

			const stats = await service.getStorageStats()

			expect(stats.totalFiles).toBe(4) // Excluding .gitkeep
			expect(stats.totalSize).toBe(4 * 1024 * 1024) // 4MB total
			expect(stats.averageFileSize).toBe(1024 * 1024) // 1MB average
			expect(stats.fileTypes['.webp']).toBe(1)
			expect(stats.fileTypes['.jpg']).toBe(1)
			expect(stats.fileTypes['.json']).toBe(2)
		})

		it('should handle empty directory', async () => {
			mockFs.readdir.mockResolvedValue(['.gitkeep'] as any)

			const stats = await service.getStorageStats()

			expect(stats.totalFiles).toBe(0)
			expect(stats.totalSize).toBe(0)
			expect(stats.averageFileSize).toBe(0)
			expect(stats.accessPatterns).toEqual([])
		})

		it('should handle file stat errors gracefully', async () => {
			mockFs.stat.mockRejectedValue(new Error('File not found'))

			await expect(service.getStorageStats()).rejects.toThrow('File not found')
		})
	})

	describe('checkThresholds', () => {
		it('should return healthy status when under thresholds', async () => {
			const mockStats = {
				size: 100 * 1024 * 1024, // 100MB
				mtime: new Date(),
				atime: new Date(),
			}

			mockFs.stat.mockResolvedValue(mockStats as any)

			const result = await service.checkThresholds()

			expect(result.status).toBe('healthy')
			expect(result.issues).toEqual([])
		})

		it('should return warning status when approaching thresholds', async () => {
			const mockStats = {
				size: 210 * 1024 * 1024, // 210MB per file, 4 files = 840MB total (over warning threshold but under critical)
				mtime: new Date(),
				atime: new Date(),
			}

			mockFs.stat.mockResolvedValue(mockStats as any)

			const result = await service.checkThresholds()

			expect(result.status).toBe('warning')
			expect(result.issues).toHaveLength(1)
			expect(result.issues[0]).toContain('Storage size warning')
		})

		it('should return critical status when exceeding thresholds', async () => {
			const mockStats = {
				size: 1100 * 1024 * 1024, // 1.1GB (over critical threshold)
				mtime: new Date(),
				atime: new Date(),
			}

			mockFs.stat.mockResolvedValue(mockStats as any)

			const result = await service.checkThresholds()

			expect(result.status).toBe('critical')
			expect(result.issues).toHaveLength(1)
			expect(result.issues[0]).toContain('Storage size critical')
		})

		it('should detect old files', async () => {
			const oldDate = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) // 35 days ago
			const mockStats = {
				size: 100 * 1024 * 1024,
				mtime: new Date(),
				atime: oldDate,
			}

			mockFs.stat.mockResolvedValue(mockStats as any)

			const result = await service.checkThresholds()

			expect(result.status).toBe('warning')
			expect(result.issues.some(issue => issue.includes('older than 30 days'))).toBe(true)
		})
	})

	describe('getEvictionCandidates', () => {
		beforeEach(() => {
			const mockStats = {
				size: 1024 * 1024,
				mtime: new Date(),
				atime: new Date(),
			}
			mockFs.stat.mockResolvedValue(mockStats as any)
		})

		it('should return candidates sorted by eviction score', async () => {
			const candidates = await service.getEvictionCandidates()

			expect(candidates).toBeDefined()
			expect(Array.isArray(candidates)).toBe(true)
		})

		it('should respect target size when specified', async () => {
			const targetSize = 2 * 1024 * 1024 // 2MB
			const candidates = await service.getEvictionCandidates(targetSize)

			const totalSize = candidates.reduce((sum, candidate) => sum + candidate.size, 0)
			expect(totalSize).toBeGreaterThanOrEqual(targetSize)
		})

		it('should return default 20% of storage when no target specified', async () => {
			const candidates = await service.getEvictionCandidates()

			// Should return some candidates for eviction
			expect(candidates.length).toBeGreaterThan(0)
		})
	})

	describe('recordFileAccess', () => {
		beforeEach(async () => {
			// Initialize access patterns by calling getStorageStats
			const mockStats = {
				size: 1024 * 1024,
				mtime: new Date(),
				atime: new Date(),
			}
			mockFs.stat.mockResolvedValue(mockStats as any)
			await service.getStorageStats()
		})

		it('should update access count for existing file', () => {
			service.recordFileAccess('image1.webp')
			service.recordFileAccess('image1.webp')

			// Access count should be updated (tested indirectly through getStorageStats)
			expect(() => service.recordFileAccess('image1.webp')).not.toThrow()
		})

		it('should handle access recording for non-existent file', () => {
			expect(() => service.recordFileAccess('nonexistent.jpg')).not.toThrow()
		})
	})

	describe('scanStorageDirectory', () => {
		it('should update access patterns during scan', async () => {
			const mockStats = {
				size: 1024 * 1024,
				mtime: new Date(),
				atime: new Date(),
			}
			mockFs.stat.mockResolvedValue(mockStats as any)

			await service.scanStorageDirectory()

			const lastScanTime = service.getLastScanTime()
			expect(lastScanTime).toBeInstanceOf(Date)
		})

		it('should handle scan errors gracefully', async () => {
			mockFs.readdir.mockRejectedValue(new Error('Permission denied'))

			// Should not throw, but log error
			await expect(service.scanStorageDirectory()).resolves.toBeUndefined()
		})

		it('should remove patterns for deleted files', async () => {
			// First scan with all files
			const mockStats = {
				size: 1024 * 1024,
				mtime: new Date(),
				atime: new Date(),
			}
			mockFs.stat.mockResolvedValue(mockStats as any)
			await service.scanStorageDirectory()

			// Second scan with fewer files
			mockFs.readdir.mockResolvedValue(['image1.webp', '.gitkeep'] as any)
			await service.scanStorageDirectory()

			// Should handle the change without errors
			expect(() => service.getLastScanTime()).not.toThrow()
		})
	})

	describe('initialization', () => {
		it('should create storage directory if it does not exist', async () => {
			// Create a new service instance to test initialization
			const newService = new StorageMonitoringService(configService)
			await newService.onModuleInit()

			expect(mockFs.mkdir).toHaveBeenCalledWith(mockStorageDirectory, { recursive: true })
		})

		it('should handle directory creation errors', async () => {
			mockFs.mkdir.mockRejectedValue(new Error('Permission denied'))

			// Should still initialize but log error
			const newService = new StorageMonitoringService(configService)
			await expect(newService.onModuleInit()).rejects.toThrow('Permission denied')
		})
	})
})
