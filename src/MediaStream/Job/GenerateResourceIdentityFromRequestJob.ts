import { Injectable, Scope } from '@nestjs/common'
import { cloneDeep } from 'lodash'
import { v5 as uuid5 } from 'uuid'
import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest'
import type { ResourceIdentifierKP } from '@microservice/Constant/KeyProperties'

@Injectable({ scope: Scope.REQUEST })
export default class GenerateResourceIdentityFromRequestJob {
	async handle(cacheImageRequest: CacheImageRequest): Promise<ResourceIdentifierKP> {
		const request = cloneDeep(cacheImageRequest)
		return uuid5(JSON.stringify(request), uuid5.URL)
	}
}
