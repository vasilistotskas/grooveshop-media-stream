import { Injectable, Scope } from '@nestjs/common'
import type CacheImageRequest from '@microservice/API/DTO/CacheImageRequest'
import ValidateCacheImageRequestResizeTargetRule from '@microservice/Rule/ValidateCacheImageRequestResizeTargetRule'

@Injectable({ scope: Scope.REQUEST })
export default class ValidateCacheImageRequestRule {
	constructor(private readonly validateCacheImageRequestResizeTargetRule: ValidateCacheImageRequestResizeTargetRule) {}

	request: CacheImageRequest = null

	public async setup(request: CacheImageRequest): Promise<void> {
		this.request = request
		await this.validateCacheImageRequestResizeTargetRule.setup(request)
	}

	public async apply(): Promise<void> {
		await this.validateCacheImageRequestResizeTargetRule.apply()
	}
}
