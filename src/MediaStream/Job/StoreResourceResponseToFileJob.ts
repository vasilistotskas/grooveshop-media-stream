import type { AxiosResponse } from 'axios'
import * as fs from 'node:fs'
import UnableToStoreFetchedResourceException from '@microservice/API/Exception/UnableToStoreFetchedResourceException'
import { Injectable, Logger, Scope } from '@nestjs/common'

@Injectable({ scope: Scope.REQUEST })
export default class StoreResourceResponseToFileJob {
	private readonly logger = new Logger(StoreResourceResponseToFileJob.name)

	async handle(resourceName: string, path: string, response: AxiosResponse): Promise<void> {
		if (!response.data) {
			this.logger.error('No data found in response')
			throw new UnableToStoreFetchedResourceException(resourceName)
		}

		const fileStream = fs.createWriteStream(path)
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
