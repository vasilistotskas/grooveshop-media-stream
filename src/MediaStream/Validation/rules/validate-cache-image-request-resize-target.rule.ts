import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import RequestedResizeTargetTooLargeException from '#microservice/API/exceptions/requested-resize-target-too-large.exception'
import { MAX_TOTAL_PIXELS } from '#microservice/common/constants/image-limits.constant'
import { Injectable } from '@nestjs/common'

/**
 * Validates that requested resize dimensions don't exceed maximum allowed pixels.
 * Stateless service - request data is passed via method parameters.
 */
@Injectable()
export default class ValidateCacheImageRequestResizeTargetRule {
	private readonly allowedPixelCount = MAX_TOTAL_PIXELS

	/**
	 * Validates the resize target dimensions
	 * @param request - The cache image request to validate
	 * @throws RequestedResizeTargetTooLargeException if dimensions exceed limit
	 */
	public async validate(request: CacheImageRequest): Promise<void> {
		const { width, height } = request.resizeOptions

		if (width === null || height === null) {
			return
		}

		const pixelCount = width * height

		if (pixelCount > this.allowedPixelCount) {
			throw new RequestedResizeTargetTooLargeException(request.resizeOptions, this.allowedPixelCount)
		}
	}
}
