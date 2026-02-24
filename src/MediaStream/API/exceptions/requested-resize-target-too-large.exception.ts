import type { ResizeOptions } from '../dto/cache-image-request.dto.js'
import { MediaStreamError } from '#microservice/common/errors/media-stream.errors'
import { HttpStatus } from '@nestjs/common'

export default class RequestedResizeTargetTooLargeException extends MediaStreamError {
	constructor(resizeRequest: ResizeOptions, allowedPixelCount: number) {
		super(
			`Requested resize target (${resizeRequest.width}x${resizeRequest.height}) exceeded maximum allowed size of ${allowedPixelCount} total pixels`,
			HttpStatus.BAD_REQUEST,
			'RESIZE_TARGET_TOO_LARGE',
			{ width: resizeRequest.width, height: resizeRequest.height, allowedPixelCount },
		)
	}
}
