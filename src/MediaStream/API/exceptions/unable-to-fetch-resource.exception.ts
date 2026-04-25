import { MediaStreamError } from '#microservice/common/errors/media-stream.errors'
import { HttpStatus } from '@nestjs/common'

export default class UnableToFetchResourceException extends MediaStreamError {
	constructor(resource: string) {
		super(
			'Requested resource could not be fetched',
			HttpStatus.BAD_GATEWAY,
			'UNABLE_TO_FETCH_RESOURCE',
			{ resource },
		)
	}
}
