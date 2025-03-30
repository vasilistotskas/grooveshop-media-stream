import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as process from 'node:process'
import { CleanupService } from '@microservice/Tasks/cleanup.service'
import { Logger } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'

jest.mock('node:fs/promises', () => ({
	readdir: jest.fn(),
	unlink: jest.fn(),
}))

jest.mock('node:path', () => ({
	join: jest.fn(),
}))

jest.mock('node:process', () => ({
	cwd: jest.fn(),
}))

describe('cleanupService', () => {
	let service: CleanupService
	let mockLogger: jest.Mocked<Logger>
	const mockStoragePath = '/mock/cwd/storage'
	const mockFiles = [
		'file1.rst',
		'file2.rsc',
		'file3.rsm',
		'file4.webp',
		'file5.rst',
		'file6.rsc',
		'file7.rsm',
		'file8.webp',
		'file9.rst',
		'file10.rsc',
		'file11.rsm',
		'file12.webp',
	]

	beforeEach(async () => {
		mockLogger = {
			debug: jest.fn(),
			error: jest.fn(),
		} as any

		jest.mocked(process.cwd).mockReturnValue('/mock/cwd')
		jest.mocked(path.join).mockReturnValue(mockStoragePath)
		jest.mocked(fs.readdir).mockResolvedValue(mockFiles as any)
		jest.mocked(fs.unlink).mockResolvedValue(undefined)

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				CleanupService,
				{
					provide: Logger,
					useValue: mockLogger,
				},
			],
		}).compile()

		service = module.get<CleanupService>(CleanupService)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('handleCleanup', () => {
		it('should delete files with specified extensions', async () => {
			await service.handleCleanup()

			expect(process.cwd).toHaveBeenCalled()
			expect(path.join).toHaveBeenCalledWith('/mock/cwd', 'storage')
			expect(fs.readdir).toHaveBeenCalledWith(mockStoragePath)
			expect(fs.unlink).toHaveBeenCalledTimes(12)
			mockFiles.forEach((file) => {
				expect(fs.unlink).toHaveBeenCalledWith(path.join(mockStoragePath, file))
			})
			expect(mockLogger.debug).toHaveBeenCalledWith('12 files deleted.')
		})

		it('should handle empty directory', async () => {
			jest.mocked(fs.readdir).mockResolvedValueOnce([])

			await service.handleCleanup()

			expect(process.cwd).toHaveBeenCalled()
			expect(path.join).toHaveBeenCalledWith('/mock/cwd', 'storage')
			expect(fs.readdir).toHaveBeenCalledWith(mockStoragePath)
			expect(fs.unlink).not.toHaveBeenCalled()
			expect(mockLogger.debug).toHaveBeenCalledWith('0 files deleted.')
		})

		it('should handle errors during cleanup', async () => {
			const error = new Error('Failed to read directory')
			jest.mocked(fs.readdir).mockRejectedValueOnce(error)

			await service.handleCleanup()

			expect(process.cwd).toHaveBeenCalled()
			expect(path.join).toHaveBeenCalledWith('/mock/cwd', 'storage')
			expect(fs.readdir).toHaveBeenCalledWith(mockStoragePath)
			expect(fs.unlink).not.toHaveBeenCalled()
			expect(mockLogger.error).toHaveBeenCalledWith('Error during cleanup: Error: Failed to read directory')
		})
	})
})
