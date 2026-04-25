import CacheImageRequest, { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { ConfigService } from '#microservice/Config/config.service'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import FetchResourceResponseJob from '#microservice/Queue/jobs/fetch-resource-response.job'
import { Test, TestingModule } from '@nestjs/testing'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('fetchResourceResponseJob', () => {
	let job: FetchResourceResponseJob
	let httpClientService: { request: ReturnType<typeof vi.fn> }

	beforeEach(async () => {
		httpClientService = {
			request: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				FetchResourceResponseJob,
				{
					provide: HttpClientService,
					useValue: httpClientService,
				},
				{
					provide: ConfigService,
					useValue: {
						getOptional: vi.fn().mockReturnValue(15000),
					},
				},
			],
		}).compile()

		job = await module.resolve<FetchResourceResponseJob>(FetchResourceResponseJob)
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

			httpClientService.request.mockResolvedValue(mockResponse)

			const result = await job.handle(request)

			expect(httpClientService.request).toHaveBeenCalledWith({
				url: request.resourceTarget,
				method: 'GET',
				responseType: 'stream',
				timeout: 15000,
			})
			expect(result).toEqual(mockResponse)
		})

		it('should handle error and return 404 response', async () => {
			// Errors with a response (HTTP-level 4xx/5xx from upstream) return a shaped
			// 404 object. Errors without a response (network-level, e.g. ECONNREFUSED)
			// throw UnableToFetchResourceException instead.
			const mockConfig = {
				headers: new AxiosHeaders(),
			}
			const mockError = new AxiosError('Not Found', 'ERR_BAD_RESPONSE', mockConfig, null, {
				status: 404,
				statusText: 'Not Found',
				headers: {} as any,
				config: mockConfig as any,
				data: null,
			} as any)

			const request = new CacheImageRequest({
				resourceTarget: 'http://example.com/image.jpg',
				resizeOptions: new ResizeOptions(),
			})

			httpClientService.request.mockRejectedValue(mockError)

			const result = await job.handle(request)

			expect(result).toEqual({
				status: 404,
				statusText: 'Not Found',
				headers: {},
				config: mockConfig,
				data: null,
			})
		})
	})
})
