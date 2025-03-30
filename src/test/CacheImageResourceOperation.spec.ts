import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '@microservice/API/DTO/CacheImageRequest'
import ManipulationJobResult from '@microservice/DTO/ManipulationJobResult'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import CacheImageResourceOperation from '@microservice/Operation/CacheImageResourceOperation'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import { HttpService } from '@nestjs/axios'
import { Logger } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { AxiosHeaders, AxiosResponse } from 'axios'

jest.mock('node:fs/promises')
jest.mock('node:process', () => ({
	cwd: jest.fn(() => '/mock/cwd'),
}))

describe('cacheImageResourceOperation', () => {
	let operation: CacheImageResourceOperation
	let mockHttpService: HttpService
	let mockGenerateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob
	let mockFetchResourceResponseJob: FetchResourceResponseJob
	let mockStoreResourceResponseToFileJob: StoreResourceResponseToFileJob
	let mockWebpImageManipulationJob: WebpImageManipulationJob
	let mockValidateCacheImageRequestRule: ValidateCacheImageRequestRule
	let mockValidateCacheImageRequestResizeTargetRule: ValidateCacheImageRequestResizeTargetRule
	let mockLogger: Logger
	let mockCwd: string
	let mockRequest: CacheImageRequest
	let moduleRef: any

	beforeEach(async () => {
		mockCwd = '/mock/cwd'
		mockRequest = new CacheImageRequest()
		mockRequest.resourceTarget = 'https://example.com/image.jpg'
		mockRequest.resizeOptions = new ResizeOptions()
		mockRequest.resizeOptions.width = 100
		mockRequest.resizeOptions.height = 100
		mockRequest.resizeOptions.quality = 80
		mockRequest.resizeOptions.format = SupportedResizeFormats.webp
		mockRequest.resizeOptions.fit = FitOptions.contain
		mockRequest.resizeOptions.position = PositionOptions.entropy
		mockRequest.resizeOptions.background = BackgroundOptions.white
		mockRequest.resizeOptions.trimThreshold = 10

		mockHttpService = {} as HttpService

		mockGenerateResourceIdentityFromRequestJob = {
			handle: jest.fn(),
		} as unknown as GenerateResourceIdentityFromRequestJob
		jest.spyOn(mockGenerateResourceIdentityFromRequestJob, 'handle').mockResolvedValue('mock-resource-id')

		mockFetchResourceResponseJob = {
			handle: jest.fn(),
		} as unknown as FetchResourceResponseJob

		const axiosHeaders = new AxiosHeaders()
		axiosHeaders.set('content-type', 'image/jpeg')

		const mockResponse = {
			status: 200,
			statusText: 'OK',
			headers: { 'content-type': 'image/jpeg' },
			data: Buffer.from('mock-image-data'),
			config: {
				headers: axiosHeaders,
				url: 'https://example.com/image.jpg',
				method: 'GET',
			},
		} as unknown as AxiosResponse

		jest.spyOn(mockFetchResourceResponseJob, 'handle').mockResolvedValue(mockResponse)

		mockStoreResourceResponseToFileJob = {
			handle: jest.fn(),
		} as unknown as StoreResourceResponseToFileJob
		jest.spyOn(mockStoreResourceResponseToFileJob, 'handle').mockResolvedValue()

		mockWebpImageManipulationJob = {
			handle: jest.fn(),
		} as unknown as WebpImageManipulationJob
		jest.spyOn(mockWebpImageManipulationJob, 'handle').mockResolvedValue({
			format: 'webp',
			size: '1000',
		} as ManipulationJobResult)

		mockValidateCacheImageRequestRule = {
			setup: jest.fn(),
			apply: jest.fn(),
		} as unknown as ValidateCacheImageRequestRule

		mockValidateCacheImageRequestResizeTargetRule = {
			setup: jest.fn(),
			apply: jest.fn(),
		} as unknown as ValidateCacheImageRequestResizeTargetRule

		mockLogger = {
			log: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
			verbose: jest.fn(),
		} as unknown as Logger

		moduleRef = await Test.createTestingModule({
			providers: [
				CacheImageResourceOperation,
				{ provide: HttpService, useValue: mockHttpService },
				{ provide: GenerateResourceIdentityFromRequestJob, useValue: mockGenerateResourceIdentityFromRequestJob },
				{ provide: FetchResourceResponseJob, useValue: mockFetchResourceResponseJob },
				{ provide: StoreResourceResponseToFileJob, useValue: mockStoreResourceResponseToFileJob },
				{ provide: WebpImageManipulationJob, useValue: mockWebpImageManipulationJob },
				{ provide: ValidateCacheImageRequestRule, useValue: mockValidateCacheImageRequestRule },
				{ provide: ValidateCacheImageRequestResizeTargetRule, useValue: mockValidateCacheImageRequestResizeTargetRule },
				{ provide: Logger, useValue: mockLogger },
			],
		}).compile()

		operation = await moduleRef.resolve(CacheImageResourceOperation)
	})

	describe('resource Path Getters', () => {
		beforeEach(async () => {
			operation.id = 'test-resource'
			await operation.setup(mockRequest)
		})

		it('should return correct resource path', () => {
			const expected = path.normalize(path.join(mockCwd, 'storage', `${operation.id}.rsc`))
			const resourcePath = operation.getResourcePath
			expect(resourcePath).toBe(expected)
		})

		it('should return correct resource temp path', () => {
			const expected = path.normalize(path.join(mockCwd, 'storage', `${operation.id}.rst`))
			const resourceTempPath = operation.getResourceTempPath
			expect(resourceTempPath).toBe(expected)
		})

		it('should return correct resource meta path', () => {
			const expected = path.normalize(path.join(mockCwd, 'storage', `${operation.id}.rsm`))
			const resourceMetaPath = operation.getResourceMetaPath
			expect(resourceMetaPath).toBe(expected)
		})
	})

	describe('optimizeAndServeDefaultImage', () => {
		it('should optimize and serve default image with custom options', async () => {
			const customOptions = new ResizeOptions()
			customOptions.width = 100
			customOptions.height = 100
			customOptions.fit = FitOptions.contain
			customOptions.position = PositionOptions.entropy
			customOptions.format = SupportedResizeFormats.webp
			customOptions.background = BackgroundOptions.white
			customOptions.trimThreshold = 5
			customOptions.quality = 100

			const mockedFs = jest.mocked(fs)
			mockedFs.access.mockRejectedValueOnce({ code: 'ENOENT' } as NodeJS.ErrnoException)

			const result = await operation.optimizeAndServeDefaultImage(customOptions)
			expect(result).toBeDefined()
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalledWith(
				path.normalize(path.join(mockCwd, 'public', 'default.png')),
				expect.any(String),
				expect.objectContaining({
					width: 100,
					height: 100,
					fit: FitOptions.contain,
					position: PositionOptions.entropy,
					format: SupportedResizeFormats.webp,
					background: BackgroundOptions.white,
					trimThreshold: 5,
					quality: 100,
				}),
			)
		})
	})
})
