import type { MockedObject } from 'vitest'
import type ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigService } from '#microservice/Config/config.service'
import { INVENTORY_TTL_MS, StorageMonitoringService } from '#microservice/Storage/services/storage-monitoring.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

vi.mock('node:fs', () => ({
	promises: {
		readdir: vi.fn(),
		stat: vi.fn(),
		mkdir: vi.fn(),
		readFile: vi.fn(),
	},
}))

const mockFs = fs as MockedObject<typeof fs>

const STORAGE_DIR = resolve('/test/storage')
const MB = 1024 * 1024
const NOW = new Date('2026-09-01T12:00:00.000Z').getTime()

interface DiskFile {
	size: number
	mtime?: number
	content?: string
	directory?: boolean
	missing?: boolean
}

function fileName(filePath: unknown): string {
	return String(filePath).split(/[/\\]/).pop() ?? ''
}

function metaJson(overrides: Partial<ResourceMetaData> = {}): string {
	return JSON.stringify({
		version: 1,
		size: '1000',
		format: 'webp',
		dateCreated: NOW - 60_000,
		privateTTL: 1000 * 60 * 60,
		publicTTL: 1000 * 60 * 60 * 2,
		accessCount: 3,
		tenantSchema: 'acme',
		...overrides,
	})
}

/** Points the mocked `fs.promises` at an in-memory flat directory. */
function useDisk(files: Record<string, DiskFile>): void {
	mockFs.readdir.mockResolvedValue(Object.keys(files) as any)
	mockFs.stat.mockImplementation((filePath: any) => {
		const file = files[fileName(filePath)]
		if (!file || file.missing) {
			const error: NodeJS.ErrnoException = new Error('no such file')
			error.code = 'ENOENT'
			return Promise.reject(error)
		}
		return Promise.resolve({
			size: file.size,
			mtimeMs: file.mtime ?? NOW,
			isFile: () => !file.directory,
		} as any)
	})
	mockFs.readFile.mockImplementation((filePath: any) => {
		const file = files[fileName(filePath)]
		return file?.content !== undefined
			? Promise.resolve(file.content)
			: Promise.reject(new Error(`unexpected readFile: ${fileName(filePath)}`))
	})
}

describe('storageMonitoringService', () => {
	let service: StorageMonitoringService
	let configService: ConfigService

	beforeEach(async () => {
		vi.useFakeTimers()
		vi.setSystemTime(NOW)

		configService = createConfigServiceMock({
			'cache.file.directory': '/test/storage',
			'storage.warningSize': 800 * MB,
			'storage.criticalSize': 1024 * MB,
			'storage.warningFileCount': 5000,
			'storage.criticalFileCount': 10000,
		})

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				StorageMonitoringService,
				{ provide: ConfigService, useValue: configService },
			],
		}).compile()

		service = module.get<StorageMonitoringService>(StorageMonitoringService)
		mockFs.mkdir.mockResolvedValue(undefined)
	})

	afterEach(() => {
		vi.clearAllMocks()
		vi.useRealTimers()
	})

	describe('getInventory', () => {
		it('groups an .rsc/.rsm pair into one entry read from the sidecar', async () => {
			useDisk({
				'abc.rsc': { size: 4 * MB },
				'abc.rsm': { size: 200, content: metaJson({ dateCreated: NOW - 5000, privateTTL: 9000, accessCount: 7, tenantSchema: 'acme' }) },
			})

			const inventory = await service.getInventory()

			expect(inventory.entries).toEqual([{
				id: 'abc',
				size: 4 * MB + 200,
				dateCreated: NOW - 5000,
				privateTTL: 9000,
				accessCount: 7,
				tenantSchema: 'acme',
			}])
			expect(inventory.orphans).toEqual([])
			expect(inventory.totalFiles).toBe(2)
			expect(inventory.totalSize).toBe(4 * MB + 200)
			expect(inventory.scannedAt).toBe(NOW)
			expect(mockFs.readdir).toHaveBeenCalledWith(STORAGE_DIR)
			expect(mockFs.readFile).toHaveBeenCalledTimes(1)
			expect(mockFs.readFile).toHaveBeenCalledWith(expect.stringContaining('abc.rsm'), 'utf8')
		})

		it('fills legacy sidecar defaults: tenantSchema "public", accessCount 0', async () => {
			const legacy = JSON.stringify({ version: 1, size: '10', format: 'webp', dateCreated: NOW - 1000, privateTTL: 5000, publicTTL: 5000 })
			useDisk({
				'legacy.rsc': { size: 10 },
				'legacy.rsm': { size: legacy.length, content: legacy },
			})

			const { entries } = await service.getInventory()

			expect(entries).toHaveLength(1)
			expect(entries[0].tenantSchema).toBe('public')
			expect(entries[0].accessCount).toBe(0)
		})

		it('classifies half pairs and temp files as orphans without reading them', async () => {
			useDisk({
				'lonely-data.rsc': { size: 100, mtime: NOW - 1000 },
				'lonely-meta.rsm': { size: 50, mtime: NOW - 2000 },
				'download.rst': { size: 300, mtime: NOW - 3000 },
				'write.rsm.tmp': { size: 20, mtime: NOW - 4000 },
			})

			const inventory = await service.getInventory()

			expect(inventory.entries).toEqual([])
			expect(inventory.orphans).toEqual(expect.arrayContaining([
				{ name: 'lonely-data.rsc', size: 100, mtime: NOW - 1000 },
				{ name: 'lonely-meta.rsm', size: 50, mtime: NOW - 2000 },
				{ name: 'download.rst', size: 300, mtime: NOW - 3000 },
				{ name: 'write.rsm.tmp', size: 20, mtime: NOW - 4000 },
			]))
			expect(inventory.orphans).toHaveLength(4)
			expect(inventory.totalFiles).toBe(4)
			expect(inventory.totalSize).toBe(470)
			expect(mockFs.readFile).not.toHaveBeenCalled()
		})

		it('turns a pair with an unparsable sidecar into two orphans', async () => {
			useDisk({
				'bad.rsc': { size: 100 },
				'bad.rsm': { size: 5, content: '{not json' },
			})

			const { entries, orphans } = await service.getInventory()

			expect(entries).toEqual([])
			expect(orphans.map(orphan => orphan.name).sort()).toEqual(['bad.rsc', 'bad.rsm'])
		})

		it('treats a sidecar without numeric dateCreated/privateTTL as unparsable', async () => {
			useDisk({
				'odd.rsc': { size: 100 },
				'odd.rsm': { size: 5, content: JSON.stringify({ dateCreated: 'yesterday', privateTTL: 1000 }) },
				'arr.rsc': { size: 100 },
				'arr.rsm': { size: 5, content: '[1,2,3]' },
			})

			const { entries, orphans } = await service.getInventory()

			expect(entries).toEqual([])
			expect(orphans).toHaveLength(4)
		})

		it('skips .gitkeep and counts default_optimized_* files without classifying them', async () => {
			useDisk({
				'.gitkeep': { size: 0 },
				'default_optimized_0123abcd.webp': { size: 3 * MB },
				'img.rsc': { size: 1 * MB },
				'img.rsm': { size: 100, content: metaJson() },
			})

			const inventory = await service.getInventory()

			expect(inventory.totalFiles).toBe(3)
			expect(inventory.totalSize).toBe(4 * MB + 100)
			expect(inventory.entries.map(entry => entry.id)).toEqual(['img'])
			expect(inventory.orphans).toEqual([])
			expect(mockFs.stat).not.toHaveBeenCalledWith(expect.stringContaining('.gitkeep'))
		})

		it('ignores directories and files that vanish between readdir and stat', async () => {
			useDisk({
				'nested': { size: 4096, directory: true },
				'gone.rsc': { size: 100, missing: true },
				'keep.rst': { size: 10 },
			})

			const inventory = await service.getInventory()

			expect(inventory.totalFiles).toBe(1)
			expect(inventory.totalSize).toBe(10)
			expect(inventory.orphans.map(orphan => orphan.name)).toEqual(['keep.rst'])
		})

		it('rejects when the directory cannot be listed', async () => {
			mockFs.readdir.mockRejectedValue(new Error('Permission denied'))

			await expect(service.getInventory()).rejects.toThrow('Permission denied')
		})
	})

	describe('snapshot caching', () => {
		beforeEach(() => {
			useDisk({ 'a.rst': { size: 1 } })
		})

		it('serves the snapshot without rescanning while it is younger than the TTL', async () => {
			const first = await service.getInventory()
			vi.advanceTimersByTime(INVENTORY_TTL_MS - 1)
			const second = await service.getInventory()

			expect(second).toBe(first)
			expect(mockFs.readdir).toHaveBeenCalledTimes(1)
		})

		it('rescans once the snapshot is older than the TTL', async () => {
			const first = await service.getInventory()
			vi.advanceTimersByTime(INVENTORY_TTL_MS)
			const second = await service.getInventory()

			expect(second).not.toBe(first)
			expect(second.scannedAt).toBe(NOW + INVENTORY_TTL_MS)
			expect(mockFs.readdir).toHaveBeenCalledTimes(2)
		})

		it('honours a caller-supplied maximum age', async () => {
			await service.getInventory()
			vi.advanceTimersByTime(10)

			await service.getInventory(5)

			expect(mockFs.readdir).toHaveBeenCalledTimes(2)
		})

		it('rescans immediately for maxAge 0', async () => {
			await service.getInventory()
			await service.getInventory(0)

			expect(mockFs.readdir).toHaveBeenCalledTimes(2)
		})

		it('shares one scan between concurrent callers', async () => {
			const [first, second] = await Promise.all([service.getInventory(0), service.getInventory(0)])

			expect(second).toBe(first)
			expect(mockFs.readdir).toHaveBeenCalledTimes(1)
		})

		it('does not cache a failed scan', async () => {
			mockFs.readdir.mockRejectedValueOnce(new Error('EIO'))

			await expect(service.getInventory()).rejects.toThrow('EIO')
			const inventory = await service.getInventory()

			expect(inventory.totalFiles).toBe(1)
			expect(mockFs.readdir).toHaveBeenCalledTimes(2)
		})
	})

	describe('checkThresholds', () => {
		function useFiles(count: number, sizeEach: number): void {
			const files: Record<string, DiskFile> = {}
			for (let index = 0; index < count; index++) {
				files[`file-${index}.rst`] = { size: sizeEach }
			}
			useDisk(files)
		}

		it('exposes the configured thresholds', () => {
			expect(service.thresholds).toEqual({
				warningSize: 800 * MB,
				criticalSize: 1024 * MB,
				warningFileCount: 5000,
				criticalFileCount: 10000,
			})
		})

		it('is healthy below every threshold', async () => {
			useFiles(10, MB)

			const check = await service.checkThresholds()

			expect(check.status).toBe('healthy')
			expect(check.issues).toEqual([])
			expect(check.inventory.totalFiles).toBe(10)
		})

		it('warns at the size warning threshold', async () => {
			useFiles(8, 100 * MB)

			const check = await service.checkThresholds()

			expect(check.status).toBe('warning')
			expect(check.issues).toEqual(['Storage size warning: 800.0 MB / 800.0 MB'])
		})

		it('is critical at the size critical threshold', async () => {
			useFiles(8, 128 * MB)

			const check = await service.checkThresholds()

			expect(check.status).toBe('critical')
			expect(check.issues).toEqual(['Storage size critical: 1.0 GB / 1.0 GB'])
		})

		it('warns at the file count warning threshold', async () => {
			useFiles(5000, 1)

			const check = await service.checkThresholds()

			expect(check.status).toBe('warning')
			expect(check.issues).toEqual(['File count warning: 5000 / 5000'])
		})

		it('is critical at the file count critical threshold', async () => {
			useFiles(10000, 1)

			const check = await service.checkThresholds()

			expect(check.status).toBe('critical')
			expect(check.issues).toEqual(['File count critical: 10000 / 10000'])
		})

		it('reports both issues and keeps critical when size is critical and count warns', async () => {
			useFiles(8192, 128 * 1024)

			const check = await service.checkThresholds()

			expect(check.status).toBe('critical')
			expect(check.issues).toEqual([
				'Storage size critical: 1.0 GB / 1.0 GB',
				'File count warning: 8192 / 5000',
			])
		})

		it('reuses the inventory snapshot', async () => {
			useFiles(1, 1)

			await service.checkThresholds()
			await service.checkThresholds()

			expect(mockFs.readdir).toHaveBeenCalledTimes(1)
		})
	})

	describe('onModuleInit', () => {
		it('creates the storage directory', async () => {
			await service.onModuleInit()

			expect(mockFs.mkdir).toHaveBeenCalledWith(STORAGE_DIR, { recursive: true })
		})

		it('rethrows when the directory cannot be created', async () => {
			mockFs.mkdir.mockRejectedValue(new Error('Permission denied'))

			await expect(service.onModuleInit()).rejects.toThrow('Permission denied')
		})
	})
})
