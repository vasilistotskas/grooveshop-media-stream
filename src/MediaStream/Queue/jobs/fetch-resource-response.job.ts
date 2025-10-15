import type CacheImageRequest from '@microservice/API/dto/cache-image-request.dto'
import type { AxiosResponse } from 'axios'
import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, Scope } from '@nestjs/common'
import { isAxiosError } from 'axios'

@Injectable({ scope: Scope.REQUEST })
export default class FetchResourceResponseJob {
	private readonly _logger = new Logger(FetchResourceResponseJob.name)
	constructor(private readonly _httpService: HttpService) {
		this._logger.debug('HttpService has been injected successfully')
	}

	async handle(request: CacheImageRequest): Promise<AxiosResponse> {
		try {
			return await this._httpService.axiosRef({
				url: request.resourceTarget,
				method: 'GET',
				responseType: 'stream',
			})
		}
		catch (error: unknown) {
			if (isAxiosError(error)) {
				this._logger.error(error.toJSON())
				return {
					status: error.response?.status ?? 404,
					statusText: error.response?.statusText ?? 'Bad Request',
					headers: {},
					config: error.config || {} as any,
					data: null,
				}
			}
			else {
				this._logger.error('Unknown error occurred while fetching resource')
				throw error
			}
		}
	}
}
