import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest'
import RequestedResizeTargetTooLargeException from '@microservice/API/Exception/RequestedResizeTargetTooLargeException'
import { Injectable, Scope } from '@nestjs/common'

@Injectable({ scope: Scope.REQUEST })
export default class ValidateCacheImageRequestResizeTargetRule {
	// 8K Squared
	allowedPixelCount = 7680 * 4320

	request!: CacheImageRequest

	public async setup(request: CacheImageRequest): Promise<void> {
		this.request = request
	}

	public async apply(): Promise<void> {
		const { width, height } = this.request.resizeOptions

		// Handle null width/height values
		if (width === null || height === null) {
			// If either dimension is null, no resize is requested, so no validation needed
			return
		}

		const pixelCount = width * height

		if (pixelCount > this.allowedPixelCount) {
			throw new RequestedResizeTargetTooLargeException(this.request.resizeOptions, this.allowedPixelCount)
		}
	}
}
