import type { AxiosResponse } from 'axios'
import type { FileHandle } from 'node:fs/promises'
import { open } from 'node:fs/promises'
import UnableToStoreFetchedResourceException from '#microservice/API/exceptions/unable-to-store-fetched-resource.exception'
import { Injectable, Logger } from '@nestjs/common'

/**
 * Stores fetched resource responses to the filesystem.
 * Stateless service - all request data is passed via method parameters.
 */
@Injectable()
export default class StoreResourceResponseToFileJob {
	private readonly _logger = new Logger(StoreResourceResponseToFileJob.name)

	async handle(resourceName: string, path: string, response: AxiosResponse): Promise<void> {
		if (!response.data || typeof response.data.pipe !== 'function') {
			this._logger.error('No data found in response or data is not streamable')
			throw new UnableToStoreFetchedResourceException(resourceName)
		}

		let fd: FileHandle | null = null

		try {
			fd = await open(path, 'w')
			const fileStream = fd.createWriteStream()

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
		finally {
			// Always close the file handle to prevent leaks
			if (fd) {
				await fd.close().catch((err: unknown) => {
					this._logger.error('Error closing file descriptor', err, { path, resourceName })
				})
			}
		}
	}
}
