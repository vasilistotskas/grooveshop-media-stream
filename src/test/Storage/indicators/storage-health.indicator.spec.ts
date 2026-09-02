import type { MockedObject } from 'vitest'
import type { CleanupStatus } from '#microservice/Storage/services/storage-cleanup.service'
import type { StorageEntry, StorageInventory, StorageThresholdCheck } from '#microservice/Storage/services/storage-monitoring.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorageHealthIndicator } from '#microservice/Storage/indicators/storage-health.indicator'
import { StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import { StorageMonitoringService } from '#microservice/Storage/services/storage-monitoring.service'

const MB = 1024 * 1024
const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-01T12:00:00.000Z').getTime()

const thresholds = {
	warningSize: 800 * MB,
	criticalSize: 1024 * MB,
	warningFileCount: 5000,
	criticalFileCount: 10000,
}

function entry(id: string, overrides: Partial<StorageEntry> = {}): StorageEntry {
	return { id, size: MB, dateCreated: NOW - DAY, privateTTL: 30 * DAY, accessCount: 0, tenantSchema: 'public', ...overrides }
}

const entries = [
	entry('newest', { dateCreated: NOW - DAY }),
	entry('expired', { dateCreated: NOW - 40 * DAY, privateTTL: 30 * DAY }),
	entry('oldest', { dateCreated: NOW - 100 * DAY, privateTTL: 365 * DAY }),
]

const inventory: StorageInventory = {
	entries,
	orphans: [{ name: 'x.rst', size: 1024, mtime: NOW }],
	totalFiles: 100,
	totalSize: 50 * MB,
	scannedAt: NOW,
}

function check(status: StorageThresholdCheck['status'], issues: string[] = []): StorageThresholdCheck {
	return { status, issues, inventory }
}

const cleanupStatus: CleanupStatus = {
	enabled: true,
	dryRun: false,
	isRunning: false,
	lastCleanup: new Date('2026-09-01T02:00:00.000Z'),
	nextCleanup: new Date('2026-09-02T02:00:00.000Z'),
}

describe('storageHealthIndicator', () => {
	let indicator: StorageHealthIndicator
	let storageMonitoring: MockedObject<StorageMonitoringService>
	let storageCleanup: MockedObject<StorageCleanupService>

	beforeEach(async () => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageHealthIndicator,
				{ provide: StorageMonitoringService, useValue: { checkThresholds: vi.fn(), thresholds } },
				{ provide: StorageCleanupService, useValue: { getCleanupStatus: vi.fn() } },
			],
		}).compile()

		indicator = module.get<StorageHealthIndicator>(StorageHealthIndicator)
		storageMonitoring = module.get(StorageMonitoringService)
		storageCleanup = module.get(StorageCleanupService)

		storageMonitoring.checkThresholds.mockResolvedValue(check('healthy'))
		storageCleanup.getCleanupStatus.mockReturnValue(cleanupStatus)
	})

	afterEach(() => {
		vi.clearAllMocks()
		vi.useRealTimers()
	})

	it('is keyed "storage"', () => {
		expect(indicator.key).toBe('storage')
	})

	it('reports up with the inventory summary when healthy', async () => {
		const result = await indicator.isHealthy()

		expect(result.storage).toEqual({
			status: 'up',
			timestamp: new Date(NOW).toISOString(),
			totalFiles: 100,
			totalSize: '50.0 MB',
			usagePercentage: 5,
			entries: 3,
			orphans: 1,
			expired: 1,
			oldestEntry: new Date(NOW - 100 * DAY).toISOString(),
			newestEntry: new Date(NOW - DAY).toISOString(),
			cleanupStatus: {
				enabled: true,
				dryRun: false,
				lastCleanup: '2026-09-01T02:00:00.000Z',
				nextCleanup: '2026-09-02T02:00:00.000Z',
			},
			thresholds: {
				warningSize: '800.0 MB',
				criticalSize: '1.0 GB',
				warningFileCount: 5000,
				criticalFileCount: 10000,
			},
		})
	})

	it('reports null entry dates for an empty tier', async () => {
		storageMonitoring.checkThresholds.mockResolvedValue({
			status: 'healthy',
			issues: [],
			inventory: { entries: [], orphans: [], totalFiles: 0, totalSize: 0, scannedAt: NOW },
		})

		const result = await indicator.isHealthy()

		expect(result.storage).toMatchObject({
			status: 'up',
			totalFiles: 0,
			totalSize: '0.0 B',
			usagePercentage: 0,
			entries: 0,
			orphans: 0,
			expired: 0,
			oldestEntry: null,
			newestEntry: null,
		})
	})

	it('passes through a cleanup that has never run and has no schedule', async () => {
		storageCleanup.getCleanupStatus.mockReturnValue({ ...cleanupStatus, enabled: false, dryRun: true, lastCleanup: null, nextCleanup: null })

		const result = await indicator.isHealthy()

		expect(result.storage.cleanupStatus).toEqual({ enabled: false, dryRun: true, lastCleanup: null, nextCleanup: null })
	})

	it('stays up with a warning marker and the issues when a warning threshold is hit', async () => {
		storageMonitoring.checkThresholds.mockResolvedValue(check('warning', ['Storage size warning: 850.0 MB / 800.0 MB']))

		const result = await indicator.isHealthy()

		expect(result.storage.status).toBe('up')
		expect(result.storage.detailStatus).toBe('warning')
		expect(result.storage.warnings).toEqual(['Storage size warning: 850.0 MB / 800.0 MB'])
		expect(result.storage.totalFiles).toBe(100)
	})

	it('goes down with the issues in the message when critical', async () => {
		storageMonitoring.checkThresholds.mockResolvedValue(check('critical', ['Storage size critical: 1.2 GB / 1.0 GB', 'File count critical: 12000 / 10000']))

		const result = await indicator.isHealthy()

		expect(result.storage.status).toBe('down')
		expect(result.storage.message).toBe('Storage in critical state: Storage size critical: 1.2 GB / 1.0 GB, File count critical: 12000 / 10000')
		expect(result.storage.totalFiles).toBe(100)
		expect(result.storage.detailStatus).toBeUndefined()
	})

	it('goes down when the inventory cannot be read', async () => {
		storageMonitoring.checkThresholds.mockRejectedValue(new Error('Storage unavailable'))

		// BaseHealthIndicator.isHealthy() resolves with a `down` result when the
		// check fails — terminus 12 rethrows anything an indicator throws as a 500.
		const result = await indicator.isHealthy()

		expect(result.storage.status).toBe('down')
		expect(result.storage.message).toContain('Storage unavailable')
	})

	it('goes down when the cleanup status cannot be read', async () => {
		storageCleanup.getCleanupStatus.mockImplementation(() => {
			throw new Error('Cleanup service unavailable')
		})

		const result = await indicator.isHealthy()

		expect(result.storage.status).toBe('down')
		expect(result.storage.message).toContain('Cleanup service unavailable')
	})

	it('goes down after the 5 s timeout when the scan hangs', async () => {
		storageMonitoring.checkThresholds.mockReturnValue(new Promise(() => {}))

		const pending = indicator.isHealthy()
		await vi.advanceTimersByTimeAsync(5000)
		const result = await pending

		expect(result.storage.status).toBe('down')
		expect(result.storage.message).toBe('Health check timeout after 5000ms')
	})
})
