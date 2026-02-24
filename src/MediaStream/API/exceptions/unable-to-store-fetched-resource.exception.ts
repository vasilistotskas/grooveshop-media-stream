import { MediaStreamError } from '#microservice/common/errors/media-stream.errors'
import { HttpStatus } from '@nestjs/common'

export default class UnableToStoreFetchedResourceException extends MediaStreamError {
	constructor(resource: string) {
		super(
			`Requested resource: ${resource} couldn't be stored`,
			HttpStatus.INTERNAL_SERVER_ERROR,
			'UNABLE_TO_STORE_RESOURCE',
			{ resource },
		)
	}
}
