import { open } from 'node:fs/promises'
import UnableToStoreFetchedResourceException from '@microservice/API/Exception/UnableToStoreFetchedResourceException'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosResponse } from 'axios'

jest.mock('node:fs/promises')

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
				createWriteStream: jest.fn().mockReturnValue({
					on: jest.fn().mockImplementation((event, callback) => {
						if (event === 'finish') {
							callback()
						}
					}),
				}),
			}

			const mockResponse: Partial<AxiosResponse> = {
				data: {
					pipe: jest.fn(),
				},
			}

      ;(open as jest.Mock).mockResolvedValue(mockFileHandle)

			await job.handle('test-resource', 'test/path', mockResponse as AxiosResponse)

			expect(open).toHaveBeenCalledWith('test/path', 'w')
			expect(mockResponse.data.pipe).toHaveBeenCalledWith(mockFileHandle.createWriteStream())
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
				createWriteStream: jest.fn().mockReturnValue({
					on: jest.fn().mockImplementation((event, callback) => {
						if (event === 'error') {
							callback(new Error('Stream error'))
						}
					}),
				}),
			}

			const mockResponse: Partial<AxiosResponse> = {
				data: {
					pipe: jest.fn(),
				},
			}

      ;(open as jest.Mock).mockResolvedValue(mockFileHandle)

			await expect(job.handle('test-resource', 'test/path', mockResponse as AxiosResponse))
				.rejects
				.toThrow(UnableToStoreFetchedResourceException)
		})
	})
})
