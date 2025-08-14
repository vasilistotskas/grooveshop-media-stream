import type { ResizeOptions } from '@microservice/API/dto/cache-image-request.dto'

export default class RequestedResizeTargetTooLargeException extends Error {
	constructor(resizeRequest: ResizeOptions, allowedPixelCount: number) {
		super(
			`Requested resize target (${resizeRequest.width}x${resizeRequest.height}) exceeded maximum allowed size of ${allowedPixelCount} total pixels`,
		)
	}
}
