import type { AxiosResponse } from 'axios'
import { open } from 'node:fs/promises'
import UnableToStoreFetchedResourceException from '@microservice/API/exceptions/unable-to-store-fetched-resource.exception'
import { Injectable, Logger, Scope } from '@nestjs/common'

@Injectable({ scope: Scope.REQUEST })
export default class StoreResourceResponseToFileJob {
	private readonly _logger = new Logger(StoreResourceResponseToFileJob.name)

	async handle(resourceName: string, path: string, response: AxiosResponse): Promise<void> {
		if (!response.data || typeof response.data.pipe !== 'function') {
			this._logger.error('No data found in response or data is not streamable')
			throw new UnableToStoreFetchedResourceException(resourceName)
		}

		const fd = await open(path, 'w')
		const fileStream = fd.createWriteStream()

		try {
			response.data.pipe(fileStream)
			await new Promise<void>((resolve, reject) => {
				fileStream
					.on('finish', () => resolve())
					.on('error', error => reject(error))
			})
		}
		catch (e) {
			this._logger.error(e)
			throw new UnableToStoreFetchedResourceException(resourceName)
		}
	}
}
