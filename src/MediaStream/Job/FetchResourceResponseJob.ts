import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest'
import { HttpService } from '@nestjs/axios'
import { Injectable, Logger, Scope } from '@nestjs/common'
import { AxiosResponse, isAxiosError } from 'axios'

@Injectable({ scope: Scope.REQUEST })
export default class FetchResourceResponseJob {
	private readonly logger = new Logger(FetchResourceResponseJob.name)
	constructor(private readonly httpService: HttpService) {
		this.logger.debug('HttpService has been injected successfully')
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
			if (isAxiosError(error)) {
				this.logger.error(error.toJSON())
				return {
					status: error.response?.status ?? 404,
					statusText: error.response?.statusText ?? 'Bad Request',
					headers: {},
					config: error.config,
					data: null,
				}
			}
			else {
				this.logger.error('Unknown error occurred while fetching resource')
				throw error
			}
		}
	}
}
