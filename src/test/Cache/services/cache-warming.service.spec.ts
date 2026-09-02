import type { Dirent } from 'node:fs'
import type { MockedObject } from 'vitest'
import type { ConfigOverrides } from '../../helpers/config-service.mock.js'
import { Buffer } from 'node:buffer'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { SchedulerRegistry } from '@nestjs/schedule'
import { Test } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CacheWarmingService } from '#microservice/Cache/services/cache-warming.service'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

vi.mock('node:fs/promises')

const mockReaddir = vi.mocked(readdir)
const mockStat = vi.mocked(stat)
const mockReadFile = vi.mocked(readFile)

function mockDirent(name: string, isFile = true): Dirent {
	return { name, isFile: () => isFile, isDirectory: () => !isFile, isBlockDevice: () => false, isCharacterDevice: () => false, isFIFO: () => false, isSocket: () => false, isSymbolicLink: () => false, path: '', parentPath: '' } as Dirent
}

function sidecar(accessCount: number, tenantSchema?: string): string {
	return JSON.stringify({
		version: 1,
		size: '1024',
		format: 'webp',
		dateCreated: Date.now(),
		privateTTL: 1000,
		publicTTL: 2000,
		accessCount,
		...(tenantSchema ? { tenantSchema } : {}),
	})
}

function enoent(): NodeJS.ErrnoException {
	return Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
}

interface Harness {
	service: CacheWarmingService
	cacheManager: MockedObject<MultiLayerCacheManager>
	configService: MockedObject<ConfigService>
	metricsService: MockedObject<MetricsService>
	storageDir: string
}

async function createHarness(overrides: ConfigOverrides = {}): Promise<Harness> {
	const configService = createConfigServiceMock(overrides)
	const module = await Test.createTestingModule({
		providers: [
			CacheWarmingService,
			{ provide: MultiLayerCacheManager, useValue: { exists: vi.fn(), set: vi.fn() } },
			{ provide: ConfigService, useValue: configService },
			{ provide: MetricsService, useValue: { recordCacheOperation: vi.fn() } },
			{ provide: SchedulerRegistry, useValue: { addCronJob: vi.fn() } },
		],
	}).compile()

	return {
		service: module.get(CacheWarmingService),
		cacheManager: module.get(MultiLayerCacheManager),
		configService: module.get(ConfigService),
		metricsService: module.get(MetricsService),
		storageDir: storageDirectory(configService),
	}
}

describe('cacheWarmingService', () => {
	let harness: Harness

	beforeEach(async () => {
		vi.resetAllMocks()
		mockStat.mockResolvedValue({ atime: new Date(), size: 1024 } as any)
		harness = await createHarness()
		harness.cacheManager.exists.mockResolvedValue(false)
		harness.cacheManager.set.mockResolvedValue()
	})

	describe('initialization', () => {
		it('should be defined', () => {
			expect(harness.service).toBeDefined()
		})

		it('should load configuration on initialization', () => {
			expect(harness.configService.get).toHaveBeenCalledWith('cache.warming')
		})
	})

	describe('cache Warmup', () => {
		it('warms popular files, reading each sidecar once and each payload once', async () => {
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc'), mockDirent('file2.rsc'), mockDirent('file3.rsc')] as any)
			mockReadFile
				.mockResolvedValueOnce(sidecar(10))
				.mockResolvedValueOnce(sidecar(8))
				.mockResolvedValueOnce(sidecar(6))
				.mockResolvedValue(Buffer.from('file content'))

			await harness.service.warmupCache()

			expect(mockReaddir).toHaveBeenCalledWith(harness.storageDir, { withFileTypes: true })
			expect(mockReadFile).toHaveBeenCalledTimes(6)
			expect(mockReadFile).toHaveBeenCalledWith(join(harness.storageDir, 'file1.rsm'), 'utf8')
			expect(mockReadFile).toHaveBeenCalledWith(join(harness.storageDir, 'file1.rsc'))
			expect(harness.cacheManager.set).toHaveBeenCalledTimes(3)
			expect(harness.metricsService.recordCacheOperation).toHaveBeenCalledWith('warmup', 'memory', 'success')
		})

		it('should skip files already in cache', async () => {
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc')] as any)
			mockReadFile.mockResolvedValue(sidecar(10))
			harness.cacheManager.exists.mockResolvedValue(true)

			await harness.service.warmupCache()

			expect(harness.cacheManager.set).not.toHaveBeenCalled()
			// The payload is not read for an entry that is already cached
			expect(mockReadFile).toHaveBeenCalledTimes(1)
		})

		it('should limit number of files warmed up', async () => {
			const limited = await createHarness({ 'cache.warming.maxFilesToWarm': 2 })
			limited.cacheManager.exists.mockResolvedValue(false)
			limited.cacheManager.set.mockResolvedValue()

			mockReaddir.mockResolvedValue([mockDirent('file1.rsc'), mockDirent('file2.rsc'), mockDirent('file3.rsc')] as any)
			mockReadFile
				.mockResolvedValueOnce(sidecar(10))
				.mockResolvedValueOnce(sidecar(8))
				.mockResolvedValueOnce(sidecar(6))
				.mockResolvedValue(Buffer.from('file content'))

			await limited.service.warmupCache()

			expect(limited.cacheManager.set).toHaveBeenCalledTimes(2)
		})

		it('should filter files by popularity threshold', async () => {
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc'), mockDirent('file2.rsc')] as any)
			mockReadFile
				.mockResolvedValueOnce(sidecar(10)) // above threshold
				.mockResolvedValueOnce(sidecar(2)) // below threshold
				.mockResolvedValue(Buffer.from('file content'))

			await harness.service.warmupCache()

			expect(harness.cacheManager.set).toHaveBeenCalledTimes(1)
			expect(harness.cacheManager.set).toHaveBeenCalledWith('image:public', 'file1', expect.any(Object), expect.any(Number))
		})

		it('skips entries whose sidecar is missing or unreadable', async () => {
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc'), mockDirent('file2.rsc'), mockDirent('file3.rsc'), mockDirent('other.rsm')] as any)
			mockReadFile
				.mockResolvedValueOnce(sidecar(10))
				.mockRejectedValueOnce(enoent())
				.mockResolvedValueOnce('not json')
				.mockResolvedValue(Buffer.from('file content'))

			await harness.service.warmupCache()

			expect(harness.cacheManager.set).toHaveBeenCalledTimes(1)
			expect(harness.cacheManager.set).toHaveBeenCalledWith('image:public', 'file1', expect.any(Object), expect.any(Number))
			expect(harness.metricsService.recordCacheOperation).toHaveBeenCalledWith('warmup', 'memory', 'success')
		})

		it('should handle file system errors gracefully', async () => {
			mockReaddir.mockRejectedValue(new Error('File system error'))

			await harness.service.warmupCache()

			expect(harness.metricsService.recordCacheOperation).toHaveBeenCalledWith('warmup', 'memory', 'success')
		})

		it('should handle individual file errors gracefully', async () => {
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc'), mockDirent('file2.rsc')] as any)
			// Call order: file1.rsm, file2.rsm (scan), then file1.rsc, file2.rsc (warmup)
			mockReadFile
				.mockResolvedValueOnce(sidecar(10))
				.mockResolvedValueOnce(sidecar(8))
				.mockResolvedValueOnce(Buffer.from('file content'))
				.mockRejectedValueOnce(new Error('File read error'))

			await harness.service.warmupCache()

			expect(harness.cacheManager.set).toHaveBeenCalledTimes(1)
			expect(harness.metricsService.recordCacheOperation).toHaveBeenCalledWith('warmup', 'memory', 'success')
		})
	})

	describe('cache entry', () => {
		it('keys the entry by the sidecar\'s tenant namespace and the file basename, carrying the parsed metadata', async () => {
			mockReaddir.mockResolvedValue([mockDirent('abc-123.rsc')] as any)
			mockReadFile
				.mockResolvedValueOnce(sidecar(20, 'acme'))
				.mockResolvedValueOnce(Buffer.from('file content'))

			await harness.service.warmupCache()

			expect(harness.cacheManager.exists).toHaveBeenCalledWith('image:acme', 'abc-123')
			expect(harness.cacheManager.set).toHaveBeenCalledWith(
				'image:acme',
				'abc-123',
				{ data: Buffer.from('file content'), metadata: expect.objectContaining({ tenantSchema: 'acme', accessCount: 20, format: 'webp' }) },
				expect.any(Number),
			)
		})

		it('defaults a sidecar without tenantSchema to the public namespace and weights the TTL by access count', async () => {
			mockReaddir.mockResolvedValue([mockDirent('file1.rsc')] as any)
			mockReadFile
				.mockResolvedValueOnce(sidecar(20))
				.mockResolvedValueOnce(Buffer.from('file content'))

			await harness.service.warmupCache()

			expect(harness.cacheManager.set).toHaveBeenCalledWith('image:public', 'file1', expect.any(Object), expect.any(Number))
			const [, , , ttl] = harness.cacheManager.set.mock.calls[0]
			const baseTtl = harness.configService.get<number>('cache.warming.baseTtl')
			// baseTtl × (1 + min(20/10, 5))
			expect(ttl).toBe(Math.floor(baseTtl * 3))
		})
	})

	describe('statistics', () => {
		it('should return warmup statistics', async () => {
			const stats = await harness.service.getWarmupStats()

			expect(stats).toEqual({ enabled: true, lastWarmup: null, filesWarmed: 0 })
		})
	})

	describe('configuration', () => {
		it('should respect disabled configuration', async () => {
			const disabled = await createHarness({ 'cache.warming.enabled': false })

			await disabled.service.warmupCache()

			expect(mockReaddir).not.toHaveBeenCalled()
		})
	})
})
