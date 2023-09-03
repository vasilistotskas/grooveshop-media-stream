import * as fs from 'fs'
import { AxiosResponse } from 'axios'
import { Injectable, Scope } from '@nestjs/common'
import UnableToStoreFetchedResourceException from '@microservice/API/Exception/UnableToStoreFetchedResourceException'

@Injectable({ scope: Scope.REQUEST })
export default class StoreResourceResponseToFileJob {
	async handle(resourceName: string, path: string, response: AxiosResponse): Promise<void> {
		const fileStream = fs.createWriteStream(path)
		try {
			response.data.pipe(fileStream)
			await new Promise((resolve, reject) => {
				fileStream.on('finish', resolve).on('error', reject)
			})
		} catch (e) {
			throw new UnableToStoreFetchedResourceException(resourceName)
		}
	}
}
