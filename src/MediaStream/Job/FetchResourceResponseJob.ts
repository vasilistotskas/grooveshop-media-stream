import { AxiosResponse } from 'axios'
import { HttpService } from '@nestjs/axios'
import { Injectable, Scope } from '@nestjs/common'
import CacheImageRequest from '@microservice/API/DTO/CacheImageRequest'

@Injectable({ scope: Scope.REQUEST })
export default class FetchResourceResponseJob {
	constructor(private readonly httpService: HttpService) {}

	async handle(request: CacheImageRequest): Promise<AxiosResponse> {
		try {
			return await this.httpService.axiosRef({
				url: request.resourceTarget,
				method: 'GET',
				responseType: 'stream'
			})
		} catch (error) {
			// Return a 404 Bad Request response
			return {
				status: 404,
				statusText: 'Bad Request',
				headers: {},
				config: error.config,
				data: null
			}
		}
	}
}
