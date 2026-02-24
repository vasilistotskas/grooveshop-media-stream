import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import type { AxiosResponse } from 'axios'
import { ConfigService } from '#microservice/Config/config.service'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'
import { Injectable, Logger } from '@nestjs/common'
import { isAxiosError } from 'axios'

/**
 * Fetches resources from remote URLs.
 * Uses HttpClientService for circuit breaker, retry, and connection pooling.
 * Stateless service - all request data is passed via method parameters.
 */
@Injectable()
export default class FetchResourceResponseJob {
	private readonly _logger = new Logger(FetchResourceResponseJob.name)
	private readonly requestTimeout: number

	constructor(
		private readonly _httpClientService: HttpClientService,
		private readonly _configService: ConfigService,
	) {
		this._logger.debug('HttpClientService has been injected successfully')
		// Use external request timeout from config, default 15s
		this.requestTimeout = this._configService.getOptional('externalServices.requestTimeout', 15000)
	}

	async handle(request: CacheImageRequest): Promise<AxiosResponse> {
		try {
			return await this._httpClientService.request({
				url: request.resourceTarget,
				method: 'GET',
				responseType: 'stream',
				timeout: this.requestTimeout,
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
