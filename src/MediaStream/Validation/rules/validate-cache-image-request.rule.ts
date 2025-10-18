import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import { Injectable, Scope } from '@nestjs/common'
import ValidateCacheImageRequestResizeTargetRule from './validate-cache-image-request-resize-target.rule.js'

@Injectable({ scope: Scope.REQUEST })
export default class ValidateCacheImageRequestRule {
	constructor(private readonly validateCacheImageRequestResizeTargetRule: ValidateCacheImageRequestResizeTargetRule) {}

	request!: CacheImageRequest

	public async setup(request: CacheImageRequest): Promise<void> {
		this.request = request
		await this.validateCacheImageRequestResizeTargetRule.setup(request)
	}

	public async apply(): Promise<void> {
		await this.validateCacheImageRequestResizeTargetRule.apply()
	}
}
