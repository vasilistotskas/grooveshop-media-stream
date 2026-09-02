import type { MockedObject } from 'vitest'
import { promises as fs } from 'node:fs'
import { ScheduleModule } from '@nestjs/schedule'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigService } from '#microservice/Config/config.service'
import { StorageHealthIndicator } from '#microservice/Storage/indicators/storage-health.indicator'
import { StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import { StorageMonitoringService } from '#microservice/Storage/services/storage-monitoring.service'
import { StorageModule } from '#microservice/Storage/storage.module'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

vi.mock('node:fs', () => ({
	promises: {
		readdir: vi.fn(),
		stat: vi.fn(),
		unlink: vi.fn(),
		mkdir: vi.fn(),
		readFile: vi.fn(),
	},
}))

const mockFs = fs as MockedObject<typeof fs>

const MB = 1024 * 1024
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const NOW = new Date('2026-09-01T12:00:00.000Z').getTime()

interface DiskFile {
	size: number
	mtime?: number
	content?: string
}

function fileName(filePath: unknown): string {
	return String(filePath).split(/[/\\]/).pop() ?? ''
}

function metaJson(dateCreated: number, privateTTL: number, accessCount = 0): string {
	return JSON.stringify({ version: 1, size: '1', format: 'webp', dateCreated, privateTTL, publicTTL: privateTTL * 2, accessCount, tenantSchema: 'acme' })
}

let disk: Record<string, DiskFile> = {}

function useDisk(files: Record<string, DiskFile>): void {
	disk = files
	mockFs.readdir.mockImplementation(async () => Object.keys(disk) as any)
	mockFs.stat.mockImplementation((filePath: any) => {
		const file = disk[fileName(filePath)]
		return file
			? Promise.resolve({ size: file.size, mtimeMs: file.mtime ?? NOW, isFile: () => true } as any)
			: Promise.reject(new Error('ENOENT'))
	})
	mockFs.readFile.mockImplementation((filePath: any) => {
		const content = disk[fileName(filePath)]?.content
		return content !== undefined ? Promise.resolve(content) : Promise.reject(new Error('ENOENT'))
	})
	mockFs.unlink.mockImplementation(async (filePath: any) => {
		delete disk[fileName(filePath)]
	})
}

describe('storage management integration', () => {
	let module: TestingModule
	let storageMonitoring: StorageMonitoringService
	let storageCleanup: StorageCleanupService
	let storageHealth: StorageHealthIndicator

	// A module per test: the monitoring snapshot lives 30 s and time is frozen.
	beforeEach(async () => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)
		mockFs.mkdir.mockResolvedValue(undefined)

		module = await Test.createTestingModule({
			imports: [StorageModule, ScheduleModule.forRoot()],
		})
			.overrideProvider(ConfigService)
			.useValue(createConfigServiceMock({
				'cache.file.directory': '/test/storage',
				'storage.warningSize': 10 * MB,
				'storage.criticalSize': 20 * MB,
				'storage.warningFileCount': 100,
				'storage.criticalFileCount': 200,
				'storage.cleanup.enabled': true,
				'storage.cleanup.cronSchedule': '0 2 * * *',
				'storage.cleanup.dryRun': false,
				'storage.cleanup.maxDuration': 300000,
				'storage.eviction.minAccessCount': 5,
			}))
			.compile()

		storageMonitoring = module.get(StorageMonitoringService)
		storageCleanup = module.get(StorageCleanupService)
		storageHealth = module.get(StorageHealthIndicator)
	})

	afterEach(async () => {
		await module.close()
		vi.clearAllMocks()
		vi.useRealTimers()
	})

	it('wires the three storage providers', () => {
		expect(storageMonitoring).toBeInstanceOf(StorageMonitoringService)
		expect(storageCleanup).toBeInstanceOf(StorageCleanupService)
		expect(storageHealth).toBeInstanceOf(StorageHealthIndicator)
		expect(storageHealth.key).toBe('storage')
	})

	it('runs inventory, thresholds, cleanup and health against one directory', async () => {
		useDisk({
			'.gitkeep': { size: 0 },
			'default_optimized_abc.webp': { size: MB },
			'live.rsc': { size: 2 * MB },
			'live.rsm': { size: 100, content: metaJson(NOW - DAY, 30 * DAY, 8) },
			'expired.rsc': { size: 3 * MB },
			'expired.rsm': { size: 100, content: metaJson(NOW - 10 * DAY, 5 * DAY) },
			'stale.rst': { size: 512, mtime: NOW - 2 * HOUR },
			'fresh.tmp': { size: 64, mtime: NOW - 5 * 60 * 1000 },
		})

		const inventory = await storageMonitoring.getInventory()
		expect(inventory.totalFiles).toBe(7)
		expect(inventory.totalSize).toBe(6 * MB + 200 + 512 + 64)
		expect(inventory.entries.map(entry => entry.id).sort()).toEqual(['expired', 'live'])
		expect(inventory.orphans.map(orphan => orphan.name).sort()).toEqual(['fresh.tmp', 'stale.rst'])

		const check = await storageMonitoring.checkThresholds()
		expect(check.status).toBe('healthy')
		expect(check.inventory).toBe(inventory)

		const cleanup = await storageCleanup.performCleanup()
		expect(cleanup.removed).toEqual({ expired: 1, stale: 1, evicted: 0 })
		expect(cleanup.filesRemoved).toBe(3)
		expect(cleanup.sizeFreed).toBe(3 * MB + 100 + 512)
		expect(cleanup.errors).toEqual([])
		expect(Object.keys(disk).sort()).toEqual(['.gitkeep', 'default_optimized_abc.webp', 'fresh.tmp', 'live.rsc', 'live.rsm'])

		await storageMonitoring.getInventory(0)
		const health = await storageHealth.isHealthy()
		expect(health.storage).toMatchObject({
			status: 'up',
			totalFiles: 4,
			totalSize: '3.0 MB',
			usagePercentage: 15,
			entries: 1,
			orphans: 1,
			expired: 0,
			oldestEntry: new Date(NOW - DAY).toISOString(),
			newestEntry: new Date(NOW - DAY).toISOString(),
			cleanupStatus: { enabled: true, dryRun: false, lastCleanup: new Date(NOW).toISOString(), nextCleanup: null },
			thresholds: { warningSize: '10.0 MB', criticalSize: '20.0 MB', warningFileCount: 100, criticalFileCount: 200 },
		})
	})

	it('evicts down to the warning thresholds and reports the tier healthy again', async () => {
		useDisk({
			'popular.rsc': { size: 4 * MB },
			'popular.rsm': { size: 10, content: metaJson(NOW - 200 * DAY, 365 * DAY, 50) },
			'old.rsc': { size: 4 * MB },
			'old.rsm': { size: 10, content: metaJson(NOW - 50 * DAY, 365 * DAY) },
			'new.rsc': { size: 4 * MB },
			'new.rsm': { size: 10, content: metaJson(NOW - DAY, 365 * DAY) },
		})

		const before = await storageMonitoring.checkThresholds()
		expect(before.status).toBe('warning')
		const unhealthy = await storageHealth.isHealthy()
		expect(unhealthy.storage.status).toBe('up')
		expect(unhealthy.storage.detailStatus).toBe('warning')

		const cleanup = await storageCleanup.performCleanup()
		expect(cleanup.removed).toEqual({ expired: 0, stale: 0, evicted: 1 })
		expect(Object.keys(disk).sort()).toEqual(['new.rsc', 'new.rsm', 'popular.rsc', 'popular.rsm'])

		await storageMonitoring.getInventory(0)
		const after = await storageHealth.isHealthy()
		expect(after.storage.status).toBe('up')
		expect(after.storage.detailStatus).toBeUndefined()
		expect(after.storage.entries).toBe(2)
	})

	it('reports the storage indicator down at the critical threshold', async () => {
		const files: Record<string, DiskFile> = {}
		for (let index = 0; index < 5; index++) {
			files[`bulk-${index}.rst`] = { size: 4 * MB }
		}
		useDisk(files)

		const result = await storageHealth.isHealthy()

		expect(result.storage.status).toBe('down')
		expect(result.storage.message).toBe('Storage in critical state: Storage size critical: 20.0 MB / 20.0 MB')
		expect(result.storage.usagePercentage).toBe(100)
	})

	it('reports the storage indicator down when the directory cannot be listed', async () => {
		mockFs.readdir.mockRejectedValue(new Error('Disk full'))

		const result = await storageHealth.isHealthy()

		expect(result.storage.status).toBe('down')
		expect(result.storage.message).toContain('Disk full')
	})
})
