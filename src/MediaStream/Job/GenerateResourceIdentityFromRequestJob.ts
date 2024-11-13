import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest'
import type { ResourceIdentifierKP } from '@microservice/Constant/KeyProperties'
import { randomUUID } from 'node:crypto'
import { Injectable, Scope } from '@nestjs/common'

@Injectable({ scope: Scope.REQUEST })
export default class GenerateResourceIdentityFromRequestJob {
	async handle(_cacheImageRequest: CacheImageRequest): Promise<ResourceIdentifierKP> {
		return randomUUID()
	}
}
