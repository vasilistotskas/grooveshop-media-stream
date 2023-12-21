import { Injectable, Scope } from '@nestjs/common'
import CacheImageRequest from '@microservice/API/DTO/CacheImageRequest'
import RequestedResizeTargetTooLargeException from '@microservice/API/Exception/RequestedResizeTargetTooLargeException'

@Injectable({ scope: Scope.REQUEST })
export default class ValidateCacheImageRequestResizeTargetRule {
	//8K Squared
	allowedPixelCount = 7680 * 4320

	request: CacheImageRequest = null

	public async setup(request: CacheImageRequest): Promise<void> {
		this.request = request
	}

	public async apply(): Promise<void> {
		const pixelCount = this.request.resizeOptions.width + this.request.resizeOptions.height
		if (pixelCount > this.allowedPixelCount) {
			throw new RequestedResizeTargetTooLargeException(this.request.resizeOptions, this.allowedPixelCount)
		}
	}
}
