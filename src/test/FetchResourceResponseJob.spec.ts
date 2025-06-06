import CacheImageRequest, { ResizeOptions } from '@microservice/API/DTO/CacheImageRequest'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import { HttpService } from '@nestjs/axios'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosError, AxiosHeaders } from 'axios'

describe('fetchResourceResponseJob', () => {
	let job: FetchResourceResponseJob
	let httpService: HttpService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				FetchResourceResponseJob,
				{
					provide: HttpService,
					useValue: {
						axiosRef: jest.fn(),
					},
				},
			],
		}).compile()

		job = await module.resolve<FetchResourceResponseJob>(FetchResourceResponseJob)
		httpService = module.get<HttpService>(HttpService)
	})

	describe('handle', () => {
		it('should successfully fetch resource response', async () => {
			const mockResponse = {
				status: 200,
				statusText: 'OK',
				headers: {},
				config: {},
				data: {},
			}

			const request = new CacheImageRequest({
				resourceTarget: 'http://example.com/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			const mockAxiosRef = jest.fn().mockResolvedValue(mockResponse)
			Object.defineProperty(httpService, 'axiosRef', { value: mockAxiosRef })

			const result = await job.handle(request)

			expect(mockAxiosRef).toHaveBeenCalledWith({
				url: request.resourceTarget,
				method: 'GET',
				responseType: 'stream',
			})
			expect(result).toEqual(mockResponse)
		})

		it('should handle error and return 404 response', async () => {
			const mockError = new AxiosError('Network error')
			mockError.config = {
				headers: new AxiosHeaders(),
			}

			const request = new CacheImageRequest({
				resourceTarget: 'http://example.com/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			const mockAxiosRef = jest.fn().mockRejectedValue(mockError)
			Object.defineProperty(httpService, 'axiosRef', { value: mockAxiosRef })

			const result = await job.handle(request)

			expect(result).toEqual({
				status: 404,
				statusText: 'Bad Request',
				headers: {},
				config: mockError.config,
				data: null,
			})
		})
	})
})
