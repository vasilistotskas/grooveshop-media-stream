import type { AxiosResponse } from 'axios'
import type { Mock } from 'vitest'
import { open, unlink } from 'node:fs/promises'
import UnableToStoreFetchedResourceException from '#microservice/API/exceptions/unable-to-store-fetched-resource.exception'
import StoreResourceResponseToFileJob from '#microservice/Queue/jobs/store-resource-response-to-file.job'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises')

describe('storeResourceResponseToFileJob', () => {
	let job: StoreResourceResponseToFileJob

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [StoreResourceResponseToFileJob],
		}).compile()

		job = await module.resolve<StoreResourceResponseToFileJob>(StoreResourceResponseToFileJob)
	})

	describe('handle', () => {
		it('should successfully store resource response to file', async () => {
			const mockFileHandle = {
				createWriteStream: vi.fn().mockReturnValue({
					on: vi.fn().mockImplementation((event, callback) => {
						if (event === 'finish') {
							callback()
						}
					}),
				}),
				close: vi.fn().mockResolvedValue(undefined),
			}

			const mockResponse: Partial<AxiosResponse> = {
				data: {
					pipe: vi.fn(),
					on: vi.fn(), // response.data.on('error', reject) handler
				},
			}

      ;(open as unknown as Mock).mockResolvedValue(mockFileHandle)

			await job.handle('test-resource', 'test/path', mockResponse as AxiosResponse)

			expect(open).toHaveBeenCalledWith('test/path', 'w')
			expect(mockResponse.data.pipe).toHaveBeenCalledWith(mockFileHandle.createWriteStream())
			expect(mockResponse.data.on).toHaveBeenCalledWith('error', expect.any(Function))
			expect(mockFileHandle.close).toHaveBeenCalled()
		})

		it('should throw UnableToStoreFetchedResourceException when response data is not streamable', async () => {
			const mockResponse: Partial<AxiosResponse> = {
				data: null,
			}

			await expect(job.handle('test-resource', 'test/path', mockResponse as AxiosResponse))
				.rejects
				.toThrow(UnableToStoreFetchedResourceException)
		})

		it('should throw UnableToStoreFetchedResourceException when response data has no pipe method', async () => {
			const mockResponse: Partial<AxiosResponse> = {
				data: {},
			}

			await expect(job.handle('test-resource', 'test/path', mockResponse as AxiosResponse))
				.rejects
				.toThrow(UnableToStoreFetchedResourceException)
		})

		it('should throw UnableToStoreFetchedResourceException when file stream encounters an error', async () => {
			const mockFileHandle = {
				createWriteStream: vi.fn().mockReturnValue({
					on: vi.fn().mockImplementation((event, callback) => {
						if (event === 'error') {
							callback(new Error('Stream error'))
						}
					}),
				}),
				close: vi.fn().mockResolvedValue(undefined),
			}

			const mockResponse: Partial<AxiosResponse> = {
				data: {
					pipe: vi.fn(),
					on: vi.fn(), // response.data.on('error', reject) handler
				},
			}

      ;(open as unknown as Mock).mockResolvedValue(mockFileHandle)
			;(unlink as unknown as Mock).mockResolvedValue(undefined)

			await expect(job.handle('test-resource', 'test/path', mockResponse as AxiosResponse))
				.rejects
				.toThrow(UnableToStoreFetchedResourceException)

			// Verify file handle is closed even on error
			expect(mockFileHandle.close).toHaveBeenCalled()
			// Verify partial temp file is cleaned up on failure
			expect(unlink).toHaveBeenCalledWith('test/path')
		})

		it('should throw UnableToStoreFetchedResourceException when response data stream errors', async () => {
			const mockFileHandle = {
				createWriteStream: vi.fn().mockReturnValue({
					on: vi.fn(), // fileStream does not trigger finish or error
				}),
				close: vi.fn().mockResolvedValue(undefined),
			}

			const mockResponse: Partial<AxiosResponse> = {
				data: {
					pipe: vi.fn(),
					on: vi.fn().mockImplementation((event, callback) => {
						if (event === 'error') {
							callback(new Error('Response stream error'))
						}
					}),
				},
			}

      ;(open as unknown as Mock).mockResolvedValue(mockFileHandle)
			;(unlink as unknown as Mock).mockResolvedValue(undefined)

			await expect(job.handle('test-resource', 'test/path', mockResponse as AxiosResponse))
				.rejects
				.toThrow(UnableToStoreFetchedResourceException)

			// Verify file handle is closed even on response data error
			expect(mockFileHandle.close).toHaveBeenCalled()
			// Verify partial temp file is cleaned up on failure
			expect(unlink).toHaveBeenCalledWith('test/path')
		})
	})
})
