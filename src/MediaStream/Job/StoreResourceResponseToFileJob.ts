import type { AxiosResponse } from 'axios'
import { open } from 'node:fs/promises'
import UnableToStoreFetchedResourceException from '@microservice/API/Exception/UnableToStoreFetchedResourceException'
import { Injectable, Logger, Scope } from '@nestjs/common'

@Injectable({ scope: Scope.REQUEST })
export default class StoreResourceResponseToFileJob {
	private readonly logger = new Logger(StoreResourceResponseToFileJob.name)

	async handle(resourceName: string, path: string, response: AxiosResponse): Promise<void> {
		if (!response.data || typeof response.data.pipe !== 'function') {
			this.logger.error('No data found in response or data is not streamable')
			throw new UnableToStoreFetchedResourceException(resourceName)
		}

		const fd = await open(path, 'w')
		const fileStream = fd.createWriteStream()

		try {
			response.data.pipe(fileStream)
			await new Promise((resolve, reject) => {
				fileStream.on('finish', resolve).on('error', reject)
			})
		}
		catch (e) {
			this.logger.error(e)
			throw new UnableToStoreFetchedResourceException(resourceName)
		}
	}
}
