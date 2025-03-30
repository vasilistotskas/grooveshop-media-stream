import CacheImageRequest, { ResizeOptions } from '@microservice/API/DTO/CacheImageRequest'
import RequestedResizeTargetTooLargeException from '@microservice/API/Exception/RequestedResizeTargetTooLargeException'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'

describe('validateCacheImageRequestResizeTargetRule', () => {
	let rule: ValidateCacheImageRequestResizeTargetRule

	beforeEach(() => {
		rule = new ValidateCacheImageRequestResizeTargetRule()
	})

	it('should be defined', () => {
		expect(rule).toBeDefined()
	})

	it('should allow valid resize options within allowed pixel count', async () => {
		const mockRequest: CacheImageRequest = new CacheImageRequest({
			resizeOptions: new ResizeOptions({
				width: 1920,
				height: 1080,
			}),
		})

		await rule.setup(mockRequest)
		await expect(rule.apply()).resolves.not.toThrow()
	})

	it('should throw an exception when the requested pixel count exceeds the allowed limit', async () => {
		const mockRequest: CacheImageRequest = new CacheImageRequest({
			resizeOptions: new ResizeOptions({
				width: 8000,
				height: 5000,
			}),
		})

		await rule.setup(mockRequest)
		await expect(rule.apply()).rejects.toThrow(RequestedResizeTargetTooLargeException)
	})
})

describe('validateCacheImageRequestRule', () => {
	let rule: ValidateCacheImageRequestRule
	let validateCacheImageRequestResizeTargetRule: ValidateCacheImageRequestResizeTargetRule

	beforeEach(() => {
		validateCacheImageRequestResizeTargetRule = new ValidateCacheImageRequestResizeTargetRule()
		rule = new ValidateCacheImageRequestRule(validateCacheImageRequestResizeTargetRule)
	})

	it('should be defined', () => {
		expect(rule).toBeDefined()
	})

	it('should setup the request and call the resize target rule setup', async () => {
		const mockRequest: CacheImageRequest = new CacheImageRequest({
			resizeOptions: new ResizeOptions({
				width: 1920,
				height: 1080,
			}),
		})

		const setupSpy = jest.spyOn(validateCacheImageRequestResizeTargetRule, 'setup')

		await rule.setup(mockRequest)

		expect(setupSpy).toHaveBeenCalledWith(mockRequest)
	})

	it('should apply the resize target rule without errors', async () => {
		const mockRequest: CacheImageRequest = new CacheImageRequest({
			resizeOptions: new ResizeOptions({
				width: 1920,
				height: 1080,
			}),
		})

		const applySpy = jest.spyOn(validateCacheImageRequestResizeTargetRule, 'apply').mockResolvedValue(undefined)

		await rule.setup(mockRequest)
		await expect(rule.apply()).resolves.not.toThrow()
		expect(applySpy).toHaveBeenCalled()
	})

	it('should throw an error if the resize target rule throws', async () => {
		const mockRequest: CacheImageRequest = new CacheImageRequest({
			resizeOptions: new ResizeOptions({
				width: 8000,
				height: 5000,
			}),
		})

		jest.spyOn(validateCacheImageRequestResizeTargetRule, 'apply').mockRejectedValue(new Error('Resize error'))

		await rule.setup(mockRequest)
		await expect(rule.apply()).rejects.toThrow('Resize error')
	})
})
