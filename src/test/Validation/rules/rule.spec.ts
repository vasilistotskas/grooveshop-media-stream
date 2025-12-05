import CacheImageRequest, { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import RequestedResizeTargetTooLargeException from '#microservice/API/exceptions/requested-resize-target-too-large.exception'
import ValidateCacheImageRequestResizeTargetRule from '#microservice/Validation/rules/validate-cache-image-request-resize-target.rule'
import ValidateCacheImageRequestRule from '#microservice/Validation/rules/validate-cache-image-request.rule'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

		// Use the new validate() method
		await expect(rule.validate(mockRequest)).resolves.not.toThrow()
	})

	it('should throw an exception when the requested pixel count exceeds the allowed limit', async () => {
		const mockRequest: CacheImageRequest = new CacheImageRequest({
			resizeOptions: new ResizeOptions({
				width: 8000,
				height: 5000,
			}),
		})

		// Use the new validate() method
		await expect(rule.validate(mockRequest)).rejects.toThrow(RequestedResizeTargetTooLargeException)
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

	it('should validate the request and call the resize target rule validate', async () => {
		const mockRequest: CacheImageRequest = new CacheImageRequest({
			resizeOptions: new ResizeOptions({
				width: 1920,
				height: 1080,
			}),
		})

		const validateSpy = vi.spyOn(validateCacheImageRequestResizeTargetRule, 'validate')

		await rule.validate(mockRequest)

		expect(validateSpy).toHaveBeenCalledWith(mockRequest)
	})

	it('should validate without errors for valid requests', async () => {
		const mockRequest: CacheImageRequest = new CacheImageRequest({
			resizeOptions: new ResizeOptions({
				width: 1920,
				height: 1080,
			}),
		})

		await expect(rule.validate(mockRequest)).resolves.not.toThrow()
	})

	it('should throw an error if the resize target rule throws', async () => {
		const mockRequest: CacheImageRequest = new CacheImageRequest({
			resizeOptions: new ResizeOptions({
				width: 8000,
				height: 5000,
			}),
		})

		vi.spyOn(validateCacheImageRequestResizeTargetRule, 'validate').mockRejectedValue(new Error('Resize error'))

		await expect(rule.validate(mockRequest)).rejects.toThrow('Resize error')
	})
})
