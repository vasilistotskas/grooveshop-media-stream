import type { AxiosResponse } from 'axios'
import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, Scope } from '@nestjs/common'
import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest'

@Injectable({ scope: Scope.REQUEST })
export default class FetchResourceResponseJob {
	private readonly logger = new Logger(FetchResourceResponseJob.name)
	constructor(
		private readonly httpService: HttpService,
	) {
		this.logger.log('HttpService has been injected successfully')
	}

	async handle(request: CacheImageRequest): Promise<AxiosResponse> {
		try {
			return await this.httpService.axiosRef({
				url: request.resourceTarget,
				method: 'GET',
				responseType: 'stream',
			})
		}
		catch (error) {
			// Return a 404 Bad Request response
			this.logger.error(error)
			return {
				status: 404,
				statusText: 'Bad Request',
				headers: {},
				config: error.config,
				data: null,
			}
		}
	}
}
