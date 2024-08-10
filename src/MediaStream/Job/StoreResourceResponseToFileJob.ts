import * as fs from 'node:fs'
import type { AxiosResponse } from 'axios'
import { Injectable, Logger, Scope } from '@nestjs/common'
import UnableToStoreFetchedResourceException from '@microservice/API/Exception/UnableToStoreFetchedResourceException'

@Injectable({ scope: Scope.REQUEST })
export default class StoreResourceResponseToFileJob {
	private readonly logger = new Logger(StoreResourceResponseToFileJob.name)

	async handle(resourceName: string, path: string, response: AxiosResponse): Promise<void> {
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
