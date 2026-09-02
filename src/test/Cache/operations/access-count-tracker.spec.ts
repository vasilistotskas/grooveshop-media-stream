import { readFile, rename, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
	ACCESS_COUNT_FLUSH_INTERVAL_MS,
	ACCESS_COUNT_FLUSH_THRESHOLD,
	AccessCountTracker,
} from '#microservice/Cache/operations/access-count-tracker.service'

vi.mock('node:fs/promises')

const mockReadFile = vi.mocked(readFile)
const mockWriteFile = vi.mocked(writeFile)
const mockRename = vi.mocked(rename)

const SIDECAR = {
	version: 1,
	size: '10',
	format: 'webp',
	dateCreated: 1_700_000_000_000,
	privateTTL: 1000,
	publicTTL: 2000,
	tenantSchema: 'acme',
}

function sidecar(accessCount: number): string {
	return JSON.stringify({ ...SIDECAR, accessCount })
}

function enoent(): NodeJS.ErrnoException {
	return Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
}

function writtenJson(call: number): Record<string, unknown> {
	return JSON.parse(mockWriteFile.mock.calls[call][1] as string)
}

describe('accessCountTracker', () => {
	let tracker: AccessCountTracker

	beforeEach(() => {
		vi.resetAllMocks()
		mockReadFile.mockResolvedValue(sidecar(4))
		mockWriteFile.mockResolvedValue(undefined)
		mockRename.mockResolvedValue(undefined)
		tracker = new AccessCountTracker()
	})

	afterEach(async () => {
		await tracker.onModuleDestroy()
		vi.useRealTimers()
	})

	it('coalesces repeated hits into one read-modify-write per sidecar', async () => {
		tracker.record('/storage/a.rsm')
		tracker.record('/storage/a.rsm')
		tracker.record('/storage/a.rsm')
		tracker.record('/storage/b.rsm')

		await tracker.flush()

		expect(mockReadFile).toHaveBeenCalledTimes(2)
		expect(mockWriteFile).toHaveBeenCalledTimes(2)
		expect(mockWriteFile).toHaveBeenCalledWith('/storage/a.rsm.tmp', expect.stringContaining('"accessCount":7'), 'utf8')
		expect(mockWriteFile).toHaveBeenCalledWith('/storage/b.rsm.tmp', expect.stringContaining('"accessCount":5'), 'utf8')
	})

	it('rewrites the sidecar atomically: tmp write, then rename over the live path, never a direct write', async () => {
		tracker.record('/storage/a.rsm')

		await tracker.flush()

		expect(mockWriteFile).toHaveBeenCalledTimes(1)
		expect(mockWriteFile).toHaveBeenCalledWith('/storage/a.rsm.tmp', expect.any(String), 'utf8')
		expect(mockRename).toHaveBeenCalledWith('/storage/a.rsm.tmp', '/storage/a.rsm')
		expect(mockWriteFile.mock.invocationCallOrder[0]).toBeLessThan(mockRename.mock.invocationCallOrder[0])
	})

	it('changes only accessCount and keeps every other sidecar field', async () => {
		tracker.record('/storage/a.rsm')

		await tracker.flush()

		expect(writtenJson(0)).toEqual({ ...SIDECAR, accessCount: 5 })
	})

	it('drops the delta when the sidecar no longer exists', async () => {
		mockReadFile.mockRejectedValue(enoent())
		tracker.record('/storage/gone.rsm')

		await tracker.flush()

		expect(mockWriteFile).not.toHaveBeenCalled()
		expect(mockRename).not.toHaveBeenCalled()

		// Nothing is left to retry on the next flush
		mockReadFile.mockClear()
		await tracker.flush()
		expect(mockReadFile).not.toHaveBeenCalled()
	})

	it('keeps persisting the remaining sidecars when one rewrite fails', async () => {
		mockReadFile
			.mockResolvedValueOnce('not json')
			.mockResolvedValueOnce(sidecar(1))
		tracker.record('/storage/bad.rsm')
		tracker.record('/storage/good.rsm')

		await expect(tracker.flush()).resolves.toBeUndefined()

		expect(mockWriteFile).toHaveBeenCalledTimes(1)
		expect(mockWriteFile).toHaveBeenCalledWith('/storage/good.rsm.tmp', expect.stringContaining('"accessCount":2'), 'utf8')
	})

	it('flushes on its own once the pending set reaches the threshold', async () => {
		for (let i = 0; i < ACCESS_COUNT_FLUSH_THRESHOLD; i++) {
			tracker.record(`/storage/${i}.rsm`)
		}

		await vi.waitFor(() => {
			expect(mockRename).toHaveBeenCalledTimes(ACCESS_COUNT_FLUSH_THRESHOLD)
		})
	})

	it('flushes on the interval once initialised', async () => {
		vi.useFakeTimers()
		tracker.onModuleInit()
		tracker.record('/storage/a.rsm')

		expect(mockReadFile).not.toHaveBeenCalled()
		await vi.advanceTimersByTimeAsync(ACCESS_COUNT_FLUSH_INTERVAL_MS)

		expect(mockRename).toHaveBeenCalledWith('/storage/a.rsm.tmp', '/storage/a.rsm')
	})

	it('flushes what is pending on shutdown and stops the interval', async () => {
		vi.useFakeTimers()
		const clearSpy = vi.spyOn(globalThis, 'clearInterval')
		tracker.onModuleInit()
		tracker.record('/storage/a.rsm')

		await tracker.onModuleDestroy()

		expect(mockRename).toHaveBeenCalledWith('/storage/a.rsm.tmp', '/storage/a.rsm')
		expect(clearSpy).toHaveBeenCalledTimes(1)

		// The interval is gone: time passing triggers no further flush
		tracker.record('/storage/b.rsm')
		await vi.advanceTimersByTimeAsync(ACCESS_COUNT_FLUSH_INTERVAL_MS * 2)
		expect(mockRename).toHaveBeenCalledTimes(1)
		clearSpy.mockRestore()
	})

	it('runs one flush at a time and folds hits recorded meanwhile into the next one', async () => {
		let releaseRead!: (raw: string) => void
		mockReadFile.mockImplementationOnce(() => new Promise<string>((resolve) => {
			releaseRead = resolve
		}))
		tracker.record('/storage/a.rsm')

		const first = tracker.flush()
		tracker.record('/storage/a.rsm')
		const second = tracker.flush()

		expect(mockReadFile).toHaveBeenCalledTimes(1)
		releaseRead(sidecar(0))
		await Promise.all([first, second])

		expect(mockWriteFile).toHaveBeenCalledTimes(2)
		expect(writtenJson(0).accessCount).toBe(1)
		expect(writtenJson(1).accessCount).toBe(5)
	})
})
