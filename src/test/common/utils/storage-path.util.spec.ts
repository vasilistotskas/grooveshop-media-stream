import type { ConfigService } from '#microservice/Config/config.service'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'

describe('storageDirectory', () => {
	it('resolves cache.file.directory to an absolute path', () => {
		const configService = { get: vi.fn().mockReturnValue('./storage') } as unknown as ConfigService

		expect(storageDirectory(configService)).toBe(resolve('./storage'))
		expect(configService.get).toHaveBeenCalledWith('cache.file.directory')
	})

	it('keeps an absolute directory as is', () => {
		const absolute = resolve('/var/cache/media')
		const configService = { get: vi.fn().mockReturnValue(absolute) } as unknown as ConfigService

		expect(storageDirectory(configService)).toBe(absolute)
	})
})
