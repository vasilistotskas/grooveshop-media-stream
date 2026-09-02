import type { AxiosResponse } from 'axios'
import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import { Injectable } from '@nestjs/common'
import { isAxiosError } from 'axios'
import UnableToFetchResourceException from '#microservice/API/exceptions/unable-to-fetch-resource.exception'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { HttpClientService } from '#microservice/HTTP/services/http-client.service'

/**
 * Fetches resources from remote URLs through HttpClientService (circuit
 * breaker, retry, connection pooling, `http.timeout`).
 * Stateless service - all request data is passed via method parameters.
 */
@Injectable()
export default class FetchResourceResponseJob {
	constructor(private readonly httpClientService: HttpClientService) {}

	async handle(request: CacheImageRequest): Promise<AxiosResponse> {
		try {
			return await this.httpClientService.request({
				url: request.resourceTarget,
				method: 'GET',
				responseType: 'stream',
			})
		}
		catch (error: unknown) {
			if (isAxiosError(error)) {
				// Network-level errors (ECONNREFUSED, ENOTFOUND, timeout) have no
				// `error.response`. Re-throw these as a typed exception so callers
				// see a 502 instead of an opaque 500.
				if (!error.response) {
					CorrelatedLogger.error(`Network error fetching resource: ${error.message}`, error.stack, FetchResourceResponseJob.name)
					throw new UnableToFetchResourceException(request.resourceTarget)
				}

				// HTTP error responses (4xx/5xx from upstream): return a shaped object
				// so the caller can apply negative-cache logic based on status.
				CorrelatedLogger.error(`Upstream returned ${error.response.status} for ${request.resourceTarget}: ${JSON.stringify(error.toJSON())}`, undefined, FetchResourceResponseJob.name)
				return {
					status: error.response.status,
					statusText: error.response.statusText,
					headers: {},
					config: error.config || {} as any,
					data: null,
				}
			}

			CorrelatedLogger.error('Unknown error occurred while fetching resource', undefined, FetchResourceResponseJob.name)
			throw error
		}
	}
}
