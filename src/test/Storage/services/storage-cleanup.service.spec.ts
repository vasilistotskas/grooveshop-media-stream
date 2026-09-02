import type { MockedObject } from 'vitest'
import type { StorageEntry, StorageInventory, StorageOrphan } from '#microservice/Storage/services/storage-monitoring.service'
import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Test, TestingModule } from '@nestjs/testing'
import { CronJob } from 'cron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigService } from '#microservice/Config/config.service'
import { evictionScore, STALE_FILE_MIN_AGE_MS, StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import { StorageMonitoringService } from '#microservice/Storage/services/storage-monitoring.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

// Mock fs module
vi.mock('node:fs', () => ({
	promises: {
		readdir: vi.fn(),
		stat: vi.fn(),
		unlink: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn(),
	},
}))

const mockFs = fs as MockedObject<typeof fs>

const STORAGE_DIR = resolve('/test/storage')
const MB = 1024 * 1024
const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-09-01T12:00:00.000Z').getTime()

const thresholds = {
	warningSize: 10 * MB,
	criticalSize: 20 * MB,
	warningFileCount: 100,
	criticalFileCount: 200,
}

function entry(id: string, overrides: Partial<StorageEntry> = {}): StorageEntry {
	return {
		id,
		size: 1 * MB,
		dateCreated: NOW - DAY,
		privateTTL: 365 * DAY,
		accessCount: 0,
		tenantSchema: 'public',
		...overrides,
	}
}

function orphan(name: string, ageMs: number, size = 512): StorageOrphan {
	return { name, size, mtime: NOW - ageMs }
}

function inventory(entries: StorageEntry[], orphans: StorageOrphan[] = [], extra = { files: 0, size: 0 }): StorageInventory {
	const entrySize = entries.reduce((sum, item) => sum + item.size, 0)
	const orphanSize = orphans.reduce((sum, item) => sum + item.size, 0)
	return {
		entries,
		orphans,
		totalFiles: entries.length * 2 + orphans.length + extra.files,
		totalSize: entrySize + orphanSize + extra.size,
		scannedAt: NOW,
	}
}

function unlinkedNames(): string[] {
	return mockFs.unlink.mock.calls.map(([filePath]) => String(filePath).split(/[/\\]/).pop() ?? '')
}

function schedulerRegistryMock(): Record<string, ReturnType<typeof vi.fn>> {
	return {
		addCronJob: vi.fn(),
		getCronJob: vi.fn(),
		deleteCronJob: vi.fn(),
		doesExist: vi.fn().mockReturnValue(false),
	}
}

describe('storageCleanupService', () => {
	let service: StorageCleanupService
	let storageMonitoring: MockedObject<StorageMonitoringService>
	let schedulerRegistry: Record<string, ReturnType<typeof vi.fn>>

	const mockConfig = {
		'cache.file.directory': '/test/storage',
		'storage.cleanup.enabled': true,
		'storage.cleanup.cronSchedule': '0 2 * * *',
		'storage.cleanup.dryRun': false,
		'storage.cleanup.maxDuration': 300000,
		'storage.eviction.minAccessCount': 5,
	}

	async function buildService(overrides: Record<string, unknown> = {}): Promise<StorageCleanupService> {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageCleanupService,
				{ provide: StorageMonitoringService, useValue: storageMonitoring },
				{ provide: ConfigService, useValue: createConfigServiceMock({ ...mockConfig, ...overrides }) },
				{ provide: SchedulerRegistry, useValue: schedulerRegistry },
			],
		}).compile()

		return module.get<StorageCleanupService>(StorageCleanupService)
	}

	beforeEach(async () => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)

		storageMonitoring = { getInventory: vi.fn(), thresholds } as unknown as MockedObject<StorageMonitoringService>
		schedulerRegistry = schedulerRegistryMock()
		service = await buildService()

		mockFs.unlink.mockReset()
		mockFs.unlink.mockResolvedValue(undefined)
		mockFs.readdir.mockReset()
		mockFs.readFile.mockReset()
	})

	afterEach(() => {
		vi.clearAllMocks()
		vi.useRealTimers()
	})

	describe('evictionScore', () => {
		it('ranks older, larger and less-served entries higher', () => {
			const base = entry('base', { dateCreated: NOW - 10 * DAY, size: 50 * MB, accessCount: 0 })

			expect(evictionScore(base, NOW)).toBe(100 + 1000 + 50)
			expect(evictionScore(entry('older', { ...base, dateCreated: NOW - 20 * DAY }), NOW)).toBeGreaterThan(evictionScore(base, NOW))
			expect(evictionScore(entry('larger', { ...base, size: 60 * MB }), NOW)).toBeGreaterThan(evictionScore(base, NOW))
			expect(evictionScore(entry('served', { ...base, accessCount: 10 }), NOW)).toBeLessThan(evictionScore(base, NOW))
		})

		it('caps the age, access and size components', () => {
			const capped = entry('capped', { dateCreated: NOW - 400 * DAY, size: 900 * MB, accessCount: 500 })

			expect(evictionScore(capped, NOW)).toBe(1000 + 0 + 100)
		})

		it('does not reward a dateCreated in the future', () => {
			const future = entry('future', { dateCreated: NOW + DAY, size: 0, accessCount: 0 })

			expect(evictionScore(future, NOW)).toBe(1000)
		})
	})

	describe('performCleanup', () => {
		it('forces a fresh inventory scan', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([]))

			await service.performCleanup()

			expect(storageMonitoring.getInventory).toHaveBeenCalledWith(0)
		})

		it('removes expired pairs sidecar-first and leaves live pairs alone', async () => {
			const expired = entry('expired', { dateCreated: NOW - 2 * DAY, privateTTL: DAY, size: 3 * MB })
			const live = entry('live', { dateCreated: NOW - DAY, privateTTL: 30 * DAY })
			storageMonitoring.getInventory.mockResolvedValue(inventory([expired, live]))

			const result = await service.performCleanup()

			expect(unlinkedNames()).toEqual(['expired.rsm', 'expired.rsc'])
			expect(mockFs.unlink).toHaveBeenCalledWith(resolve(STORAGE_DIR, 'expired.rsm'))
			expect(result.removed).toEqual({ expired: 1, stale: 0, evicted: 0 })
			expect(result.filesRemoved).toBe(2)
			expect(result.sizeFreed).toBe(3 * MB)
			expect(result.errors).toEqual([])
			expect(result.duration).toBeGreaterThanOrEqual(0)
		})

		it('treats a pair whose TTL ends exactly now as expired', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([
				entry('edge', { dateCreated: NOW - DAY, privateTTL: DAY }),
			]))

			const result = await service.performCleanup()

			expect(result.removed.expired).toBe(1)
		})

		it('removes orphans and temp files older than an hour and keeps younger ones', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([], [
				orphan('young.rst', STALE_FILE_MIN_AGE_MS - 1),
				orphan('old.rst', STALE_FILE_MIN_AGE_MS, 700),
				orphan('lonely.rsm', 2 * STALE_FILE_MIN_AGE_MS, 300),
			]))

			const result = await service.performCleanup()

			expect(unlinkedNames().sort()).toEqual(['lonely.rsm', 'old.rst'])
			expect(result.removed).toEqual({ expired: 0, stale: 2, evicted: 0 })
			expect(result.filesRemoved).toBe(2)
			expect(result.sizeFreed).toBe(1000)
		})

		it('does not evict while under both warning thresholds', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([entry('a'), entry('b')]))

			const result = await service.performCleanup()

			expect(mockFs.unlink).not.toHaveBeenCalled()
			expect(result.removed.evicted).toBe(0)
		})

		it('evicts the highest-scoring pairs first until under the file count threshold', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([
				entry('newest', { dateCreated: NOW - DAY }),
				entry('oldest', { dateCreated: NOW - 30 * DAY }),
				entry('middle', { dateCreated: NOW - 10 * DAY }),
			], [], { files: 96, size: 0 }))

			const result = await service.performCleanup()

			// 102 files >= 100: two pairs must go, the newest survives.
			expect(unlinkedNames()).toEqual(['oldest.rsm', 'oldest.rsc', 'middle.rsm', 'middle.rsc'])
			expect(result.removed).toEqual({ expired: 0, stale: 0, evicted: 2 })
			expect(result.filesRemoved).toBe(4)
		})

		it('evicts until under the size threshold', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([
				entry('small', { size: 1 * MB, dateCreated: NOW - DAY }),
				entry('big', { size: 6 * MB, dateCreated: NOW - DAY }),
				entry('medium', { size: 4 * MB, dateCreated: NOW - DAY }),
			]))

			const result = await service.performCleanup()

			// 11 MB >= 10 MB: the biggest pair alone brings the tier to 5 MB.
			expect(unlinkedNames()).toEqual(['big.rsm', 'big.rsc'])
			expect(result.removed.evicted).toBe(1)
			expect(result.sizeFreed).toBe(6 * MB)
		})

		it('counts expired and stale removals before deciding whether to evict', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([
				entry('expired', { dateCreated: NOW - 2 * DAY, privateTTL: DAY, size: 6 * MB }),
				entry('live', { size: 5 * MB }),
			]))

			const result = await service.performCleanup()

			// 11 MB total, expiry alone frees 6 MB, so nothing is evicted.
			expect(result.removed).toEqual({ expired: 1, stale: 0, evicted: 0 })
			expect(unlinkedNames()).toEqual(['expired.rsm', 'expired.rsc'])
		})

		it('evicts popular pairs only after every other live pair is gone', async () => {
			const popular = entry('popular', { dateCreated: NOW - 300 * DAY, accessCount: 5, size: 5 * MB })
			const unpopular = entry('unpopular', { dateCreated: NOW - DAY, accessCount: 4, size: 5 * MB })
			storageMonitoring.getInventory.mockResolvedValue(inventory([popular, unpopular], [], { files: 0, size: 4 * MB }))

			const result = await service.performCleanup()

			// 14 MB: the unpopular pair goes first (9 MB, under), the popular one stays.
			expect(unlinkedNames()).toEqual(['unpopular.rsm', 'unpopular.rsc'])
			expect(result.removed.evicted).toBe(1)
		})

		it('does evict popular pairs when nothing else brings the tier under the thresholds', async () => {
			const popular = entry('popular', { dateCreated: NOW - 300 * DAY, accessCount: 50, size: 5 * MB })
			const unpopular = entry('unpopular', { dateCreated: NOW - DAY, accessCount: 0, size: 5 * MB })
			storageMonitoring.getInventory.mockResolvedValue(inventory([popular, unpopular], [], { files: 0, size: 6 * MB }))

			const result = await service.performCleanup()

			expect(unlinkedNames()).toEqual(['unpopular.rsm', 'unpopular.rsc', 'popular.rsm', 'popular.rsc'])
			expect(result.removed.evicted).toBe(2)
		})

		it('reports without deleting when dry run is configured', async () => {
			const dryRunService = await buildService({ 'storage.cleanup.dryRun': true })
			storageMonitoring.getInventory.mockResolvedValue(inventory([
				entry('expired', { dateCreated: NOW - 2 * DAY, privateTTL: DAY, size: 3 * MB }),
				entry('bulk', { size: 10 * MB }),
			], [orphan('old.rst', 2 * STALE_FILE_MIN_AGE_MS, 100)]))

			const result = await dryRunService.performCleanup()

			// Expiry and the stale sweep leave exactly 10 MB, still at the warning size.
			expect(mockFs.unlink).not.toHaveBeenCalled()
			expect(result.removed).toEqual({ expired: 1, stale: 1, evicted: 1 })
			expect(result.filesRemoved).toBe(5)
			expect(result.sizeFreed).toBe(13 * MB + 100)
			expect(dryRunService.getCleanupStatus().dryRun).toBe(true)
		})

		it('stops once the configured time budget is spent and says so', async () => {
			const budgeted = await buildService({ 'storage.cleanup.maxDuration': 1000 })
			storageMonitoring.getInventory.mockResolvedValue(inventory([
				entry('first', { dateCreated: NOW - 2 * DAY, privateTTL: DAY }),
				entry('second', { dateCreated: NOW - 2 * DAY, privateTTL: DAY }),
			], [orphan('old.rst', 2 * STALE_FILE_MIN_AGE_MS)]))
			mockFs.unlink.mockImplementation(async () => {
				vi.setSystemTime(Date.now() + 600)
			})

			const result = await budgeted.performCleanup()

			expect(unlinkedNames()).toEqual(['first.rsm', 'first.rsc'])
			expect(result.removed).toEqual({ expired: 1, stale: 0, evicted: 0 })
			expect(result.errors).toEqual(['Cleanup time budget (1000ms) exhausted; remaining passes skipped'])
		})

		it('accumulates per-file errors and carries on', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([
				entry('locked', { dateCreated: NOW - 2 * DAY, privateTTL: DAY }),
				entry('fine', { dateCreated: NOW - 2 * DAY, privateTTL: DAY }),
			], [orphan('stuck.rst', 2 * STALE_FILE_MIN_AGE_MS)]))
			mockFs.unlink.mockImplementation((filePath: any) => {
				const name = String(filePath).split(/[/\\]/).pop()
				return name === 'locked.rsm' || name === 'stuck.rst'
					? Promise.reject(new Error('EACCES: permission denied'))
					: Promise.resolve(undefined)
			})

			const result = await service.performCleanup()

			expect(result.errors).toEqual([
				'Failed to remove locked: EACCES: permission denied',
				'Failed to remove stuck.rst: EACCES: permission denied',
			])
			expect(result.removed).toEqual({ expired: 1, stale: 0, evicted: 0 })
			expect(result.filesRemoved).toBe(2)
		})

		it('ignores files that are already gone', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([
				entry('half', { dateCreated: NOW - 2 * DAY, privateTTL: DAY }),
			]))
			mockFs.unlink.mockImplementation((filePath: any) => {
				if (String(filePath).endsWith('.rsc')) {
					const error: NodeJS.ErrnoException = new Error('no such file')
					error.code = 'ENOENT'
					return Promise.reject(error)
				}
				return Promise.resolve(undefined)
			})

			const result = await service.performCleanup()

			expect(result.errors).toEqual([])
			expect(result.removed.expired).toBe(1)
		})

		it('rejects a second run while one is in progress', async () => {
			let release!: (value: StorageInventory) => void
			storageMonitoring.getInventory.mockReturnValue(new Promise<StorageInventory>((res) => {
				release = res
			}))

			const first = service.performCleanup()
			expect(service.getCleanupStatus().isRunning).toBe(true)
			await expect(service.performCleanup()).rejects.toThrow('Cleanup is already running')

			release(inventory([]))
			await first
			expect(service.getCleanupStatus().isRunning).toBe(false)
		})

		it('propagates an inventory failure and records no run', async () => {
			storageMonitoring.getInventory.mockRejectedValue(new Error('Disk error'))

			await expect(service.performCleanup()).rejects.toThrow('Disk error')
			expect(service.getCleanupStatus()).toMatchObject({ isRunning: false, lastCleanup: null })
		})
	})

	describe('getCleanupStatus', () => {
		it('has no last or next cleanup before a run or cron registration', () => {
			expect(service.getCleanupStatus()).toEqual({
				enabled: true,
				dryRun: false,
				isRunning: false,
				lastCleanup: null,
				nextCleanup: null,
			})
		})

		it('records the time of the last run', async () => {
			storageMonitoring.getInventory.mockResolvedValue(inventory([]))

			await service.performCleanup()

			expect(service.getCleanupStatus().lastCleanup).toEqual(new Date(NOW))
		})
	})

	describe('onModuleInit', () => {
		it('registers and starts the cleanup cron when enabled', () => {
			service.onModuleInit()

			expect(schedulerRegistry.addCronJob).toHaveBeenCalledWith('storage-cleanup', expect.any(CronJob))
			const job = schedulerRegistry.addCronJob.mock.calls[0][1] as CronJob
			try {
				expect(job.isActive).toBe(true)
				// Cron schedules in the machine's local zone, so only the wall-clock hour is stable.
				const next = service.getCleanupStatus().nextCleanup
				expect(next).toBeInstanceOf(Date)
				expect(next!.getHours()).toBe(2)
				expect(next!.getTime()).toBeGreaterThan(NOW)
			}
			finally {
				job.stop()
			}
		})

		it('registers nothing when cleanup is disabled', async () => {
			const disabled = await buildService({ 'storage.cleanup.enabled': false })

			disabled.onModuleInit()

			expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled()
			expect(disabled.getCleanupStatus()).toMatchObject({ enabled: false, nextCleanup: null })
		})

		it('runs a cleanup on each cron tick and swallows failures', async () => {
			storageMonitoring.getInventory.mockRejectedValueOnce(new Error('Disk error'))
			storageMonitoring.getInventory.mockResolvedValue(inventory([]))
			service.onModuleInit()
			const job = schedulerRegistry.addCronJob.mock.calls[0][1] as CronJob

			try {
				await expect(job.fireOnTick()).resolves.toBeUndefined()
				await job.fireOnTick()
				expect(storageMonitoring.getInventory).toHaveBeenCalledTimes(2)
				expect(service.getCleanupStatus().lastCleanup).toEqual(new Date(NOW))
			}
			finally {
				job.stop()
			}
		})
	})

	describe('removeTenantFiles', () => {
		// FIX 1: MultiLayerCacheManager only invalidates memory + Redis. This
		// sweep is what removes the matching on-disk .rsm/.rsc pairs so a
		// flushed resource doesn't resurrect from disk on the next request.
		function mockMetaContent(tenantSchema?: string): string {
			return JSON.stringify({
				version: 1,
				size: '1000',
				format: 'webp',
				dateCreated: Date.now(),
				privateTTL: 1000,
				publicTTL: 1000,
				accessCount: 0,
				...(tenantSchema !== undefined ? { tenantSchema } : {}),
			})
		}

		it('removes only the .rsm/.rsc pair belonging to the flushed tenant schema', async () => {
			mockFs.readdir.mockResolvedValue([
				'uuid-tenant-a.rsm',
				'uuid-tenant-a.rsc',
				'uuid-tenant-b.rsm',
				'uuid-tenant-b.rsc',
				'default_optimized_abc.webp',
			] as any)

			mockFs.readFile.mockImplementation((filePath: any) => {
				const filename = filePath.split(/[/\\]/).pop()
				if (filename === 'uuid-tenant-a.rsm')
					return Promise.resolve(mockMetaContent('tenant_a'))
				if (filename === 'uuid-tenant-b.rsm')
					return Promise.resolve(mockMetaContent('tenant_b'))
				return Promise.reject(new Error(`unexpected readFile: ${filename}`))
			})

			const result = await service.removeTenantFiles('tenant_a')

			expect(result.filesRemoved).toBe(1)
			expect(result.errors).toEqual([])
			expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('uuid-tenant-a.rsm'))
			expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('uuid-tenant-a.rsc'))
			expect(mockFs.unlink).not.toHaveBeenCalledWith(expect.stringContaining('uuid-tenant-b.rsm'))
			expect(mockFs.unlink).not.toHaveBeenCalledWith(expect.stringContaining('uuid-tenant-b.rsc'))
		})

		it('treats legacy .rsm sidecars without a tenantSchema field as "public"', async () => {
			mockFs.readdir.mockResolvedValue(['legacy-uuid.rsm', 'legacy-uuid.rsc'] as any)
			mockFs.readFile.mockResolvedValue(mockMetaContent(undefined))

			const result = await service.removeTenantFiles('public')

			expect(result.filesRemoved).toBe(1)
			expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('legacy-uuid.rsm'))
			expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('legacy-uuid.rsc'))
		})

		it('never reads the .rsc file contents (only unlinks it)', async () => {
			mockFs.readdir.mockResolvedValue(['uuid-tenant-a.rsm', 'uuid-tenant-a.rsc'] as any)
			mockFs.readFile.mockResolvedValue(mockMetaContent('tenant_a'))

			await service.removeTenantFiles('tenant_a')

			expect(mockFs.readFile).toHaveBeenCalledTimes(1)
			expect(mockFs.readFile).toHaveBeenCalledWith(expect.stringContaining('uuid-tenant-a.rsm'), 'utf8')
		})

		it('continues the sweep past a corrupt .rsm file and reports it as an error', async () => {
			mockFs.readdir.mockResolvedValue(['corrupt.rsm', 'uuid-tenant-a.rsm', 'uuid-tenant-a.rsc'] as any)
			mockFs.readFile.mockImplementation((filePath: any) => {
				const filename = filePath.split(/[/\\]/).pop()
				if (filename === 'corrupt.rsm')
					return Promise.resolve('{not valid json')
				return Promise.resolve(mockMetaContent('tenant_a'))
			})

			const result = await service.removeTenantFiles('tenant_a')

			expect(result.filesRemoved).toBe(1)
			expect(result.errors).toHaveLength(1)
			expect(result.errors[0]).toContain('corrupt.rsm')
			expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringContaining('uuid-tenant-a.rsm'))
		})

		it('does not unlink anything when no .rsm files match the tenant schema', async () => {
			mockFs.readdir.mockResolvedValue(['uuid-tenant-b.rsm', 'uuid-tenant-b.rsc'] as any)
			mockFs.readFile.mockResolvedValue(mockMetaContent('tenant_b'))

			const result = await service.removeTenantFiles('tenant_a')

			expect(result.filesRemoved).toBe(0)
			expect(result.errors).toEqual([])
			expect(mockFs.unlink).not.toHaveBeenCalled()
		})

		it('handles a storage directory read failure gracefully', async () => {
			mockFs.readdir.mockRejectedValue(new Error('Permission denied'))

			const result = await service.removeTenantFiles('tenant_a')

			expect(result.filesRemoved).toBe(0)
			expect(result.errors[0]).toContain('Permission denied')
		})

		it('tolerates a missing .rsc file (ENOENT) for a matched tenant .rsm', async () => {
			mockFs.readdir.mockResolvedValue(['uuid-tenant-a.rsm'] as any)
			mockFs.readFile.mockResolvedValue(mockMetaContent('tenant_a'))
			mockFs.unlink.mockImplementation((filePath: any) => {
				const filename = filePath.split(/[/\\]/).pop()
				if (filename === 'uuid-tenant-a.rsc') {
					const err: NodeJS.ErrnoException = new Error('no such file')
					err.code = 'ENOENT'
					return Promise.reject(err)
				}
				return Promise.resolve(undefined)
			})

			const result = await service.removeTenantFiles('tenant_a')

			expect(result.filesRemoved).toBe(1)
			expect(result.errors).toEqual([])
		})
	})
})
