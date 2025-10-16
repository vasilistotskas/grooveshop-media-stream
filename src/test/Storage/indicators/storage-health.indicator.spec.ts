import type { MockedObject } from 'vitest'
import { ConfigService } from '@microservice/Config/config.service'
import { StorageHealthIndicator } from '@microservice/Storage/indicators/storage-health.indicator'
import { StorageCleanupService } from '@microservice/Storage/services/storage-cleanup.service'
import { StorageMonitoringService } from '@microservice/Storage/services/storage-monitoring.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('storageHealthIndicator', () => {
	let indicator: StorageHealthIndicator
	let storageMonitoring: MockedObject<StorageMonitoringService>
	let storageCleanup: MockedObject<StorageCleanupService>
	let configService: MockedObject<ConfigService>

	const mockStorageStats = {
		totalFiles: 100,
		totalSize: 50 * 1024 * 1024, // 50MB
		averageFileSize: 500 * 1024, // 500KB
		oldestFile: new Date('2024-01-01'),
		newestFile: new Date('2024-01-15'),
		fileTypes: { '.jpg': 50, '.png': 30, '.webp': 20 },
		accessPatterns: [],
	}

	const mockThresholds = {
		status: 'healthy' as const,
		issues: [],
		stats: mockStorageStats,
	}

	beforeEach(async () => {
		const mockStorageMonitoringService = {
			getStorageStats: vi.fn(),
			checkThresholds: vi.fn(),
			getEvictionCandidates: vi.fn(),
		}

		const mockStorageCleanupService = {
			getCleanupStatus: vi.fn(),
		}

		const mockConfigService = {
			getOptional: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageHealthIndicator,
				{
					provide: StorageMonitoringService,
					useValue: mockStorageMonitoringService,
				},
				{
					provide: StorageCleanupService,
					useValue: mockStorageCleanupService,
				},
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
			],
		}).compile()

		indicator = module.get<StorageHealthIndicator>(StorageHealthIndicator)
		storageMonitoring = module.get(StorageMonitoringService)
		storageCleanup = module.get(StorageCleanupService)
		configService = module.get(ConfigService)

		// Setup default mocks
		storageMonitoring.getStorageStats.mockResolvedValue(mockStorageStats)
		storageCleanup.getCleanupStatus.mockReturnValue({
			enabled: true,
			isRunning: false,
			lastCleanup: new Date('2024-01-14'),
			nextCleanup: new Date('2024-01-15'),
			policies: [],
		})
		configService.getOptional.mockImplementation((key: string, defaultValue: any) => {
			switch (key) {
				case 'storage.maxSize':
					return 1024 * 1024 * 1024 // 1GB
				case 'storage.health.warningThreshold':
					return 0.8
				case 'storage.health.criticalThreshold':
					return 0.9
				case 'storage.warningSize':
					return 800 * 1024 * 1024
				case 'storage.criticalSize':
					return 1024 * 1024 * 1024
				case 'storage.warningFileCount':
					return 5000
				case 'storage.criticalFileCount':
					return 10000
				default:
					return defaultValue
			}
		})
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	describe('initialization', () => {
		it('should be defined', () => {
			expect(indicator).toBeDefined()
		})
	})

	describe('isHealthy', () => {
		it('should return healthy status when storage is within thresholds', async () => {
			storageMonitoring.checkThresholds.mockResolvedValue(mockThresholds)

			const result = await indicator.isHealthy()

			expect(result.storage.status).toBe('up')
			expect(result.storage.totalFiles).toBe(100)
			expect(result.storage.totalSize).toBe('50.0 MB')
		})

		it('should return healthy status with cleanup enabled', async () => {
			storageMonitoring.checkThresholds.mockResolvedValue(mockThresholds)

			const result = await indicator.isHealthy()

			expect(result.storage.status).toBe('up')
			expect(result.storage.cleanupStatus.enabled).toBe(true)
		})

		it('should return unhealthy status when storage exceeds thresholds', async () => {
			storageMonitoring.checkThresholds.mockResolvedValue({
				status: 'critical',
				issues: ['Storage size critical: 1.2GB exceeds 1GB limit'],
				stats: mockStorageStats,
			})

			const result = await indicator.isHealthy()
			expect(result.storage.status).toBe('down')
			expect(result.storage.message).toContain('Storage in critical state')
		})

		it('should include top file types in details', async () => {
			storageMonitoring.checkThresholds.mockResolvedValue(mockThresholds)

			const result = await indicator.isHealthy()

			expect(result.storage.topFileTypes).toEqual([
				{ extension: '.jpg', count: 50 },
				{ extension: '.png', count: 30 },
				{ extension: '.webp', count: 20 },
			])
		})

		it('should include cleanup status in details', async () => {
			storageMonitoring.checkThresholds.mockResolvedValue(mockThresholds)

			const result = await indicator.isHealthy()

			expect(result.storage.cleanupStatus.enabled).toBe(true)
			expect(result.storage.cleanupStatus.lastCleanup).toBe('2024-01-14T00:00:00.000Z')
		})

		it('should include recommendations when available', async () => {
			storageMonitoring.checkThresholds.mockResolvedValue({
				status: 'warning',
				issues: ['Storage approaching limits'],
				stats: mockStorageStats,
			})

			const result = await indicator.isHealthy()

			expect(result.storage.recommendations).toContain(
				'Schedule cleanup soon to prevent storage issues',
			)
		})

		it('should handle storage monitoring errors', async () => {
			storageMonitoring.checkThresholds.mockRejectedValue(
				new Error('Storage unavailable'),
			)

			const result = await indicator.isHealthy()

			expect(result.storage.status).toBe('down')
			expect(result.storage.message).toContain('Storage unavailable')
		})
	})

	describe('configuration-based recommendations', () => {
		beforeEach(() => {
			configService.getOptional.mockImplementation((key: string, defaultValue: any) => {
				switch (key) {
					case 'storage.warningSize':
						return 800 * 1024 * 1024 // 800MB
					case 'storage.criticalSize':
						return 1024 * 1024 * 1024 // 1GB
					case 'storage.warningFileCount':
						return 5000
					case 'storage.criticalFileCount':
						return 10000
					case 'storage.maxFileAge':
						return 30
					default:
						return defaultValue
				}
			})
		})

		it('should recommend cleanup when approaching size limits', async () => {
			// Mock storage at 850MB (above 800MB warning)
			const warningStats = {
				...mockStorageStats,
				totalSize: 850 * 1024 * 1024,
			}
			storageMonitoring.getStorageStats.mockResolvedValue(warningStats)

			storageMonitoring.checkThresholds.mockResolvedValue({
				status: 'warning',
				issues: ['Storage size warning'],
				stats: warningStats,
			})

			const result = await indicator.isHealthy()

			expect(result.storage.recommendations).toContain(
				'Schedule cleanup soon to prevent storage issues',
			)
		})

		it('should recommend cleanup when disabled and storage is full', async () => {
			storageCleanup.getCleanupStatus.mockReturnValue({
				enabled: false,
				isRunning: false,
				lastCleanup: new Date('2024-01-01'),
				nextCleanup: new Date('2024-01-02'),
				policies: [],
			})

			storageMonitoring.checkThresholds.mockResolvedValue({
				status: 'warning',
				issues: ['Storage size warning'],
				stats: mockStorageStats,
			})

			const result = await indicator.isHealthy()

			expect(result.storage.recommendations).toContain(
				'Enable automatic cleanup to maintain storage health',
			)
		})

		it('should recommend file review when cleanup is stale', async () => {
			storageCleanup.getCleanupStatus.mockReturnValue({
				enabled: true,
				isRunning: false,
				lastCleanup: new Date('2024-01-01'), // 2 weeks ago
				nextCleanup: new Date('2024-01-16'),
				policies: [],
			})

			storageMonitoring.checkThresholds.mockResolvedValue({
				status: 'warning',
				issues: ['Storage size warning'],
				stats: mockStorageStats,
			})

			const result = await indicator.isHealthy()

			expect(result.storage.recommendations).toContain(
				'Last cleanup was over a week ago - consider running manual cleanup',
			)
		})

		it('should recommend file type optimization for dominant types', async () => {
			const statsWithManyJpgs = {
				...mockStorageStats,
				fileTypes: { '.jpg': 800, '.png': 200 },
			}

			storageMonitoring.checkThresholds.mockResolvedValue({
				status: 'warning',
				issues: ['Storage size warning'],
				stats: statsWithManyJpgs,
			})

			const result = await indicator.isHealthy()

			expect(result.storage.topFileTypes[0]).toEqual({
				extension: '.jpg',
				count: 800,
			})
		})

		it('should handle cleanup service errors gracefully', async () => {
			storageCleanup.getCleanupStatus.mockImplementation(() => {
				throw new Error('Cleanup service unavailable')
			})

			storageMonitoring.checkThresholds.mockResolvedValue(mockThresholds)

			const result = await indicator.isHealthy()

			expect(result.storage.status).toBe('down')
			expect(result.storage.message).toContain('Cleanup service unavailable')
		})

		it('should handle threshold check errors', async () => {
			storageMonitoring.checkThresholds.mockRejectedValue(new Error('Storage unavailable'))

			const result = await indicator.isHealthy()

			expect(result.storage.status).toBe('down')
			expect(result.storage.message).toContain('Storage unavailable')
		})
	})
})
