import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import RequestedResizeTargetTooLargeException from '#microservice/API/exceptions/requested-resize-target-too-large.exception'
import { Injectable, Scope } from '@nestjs/common'

@Injectable({ scope: Scope.REQUEST })
export default class ValidateCacheImageRequestResizeTargetRule {
	allowedPixelCount = 7680 * 4320

	request!: CacheImageRequest

	public async setup(request: CacheImageRequest): Promise<void> {
		this.request = request
	}

	public async apply(): Promise<void> {
		const { width, height } = this.request.resizeOptions

		if (width === null || height === null) {
			return
		}

		const pixelCount = width * height

		if (pixelCount > this.allowedPixelCount) {
			throw new RequestedResizeTargetTooLargeException(this.request.resizeOptions, this.allowedPixelCount)
		}
	}
}
