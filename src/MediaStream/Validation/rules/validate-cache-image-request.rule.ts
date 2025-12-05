import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import { Injectable } from '@nestjs/common'
import ValidateCacheImageRequestResizeTargetRule from './validate-cache-image-request-resize-target.rule.js'

/**
 * Orchestrates validation of cache image requests.
 * Stateless service - request data is passed via method parameters.
 */
@Injectable()
export default class ValidateCacheImageRequestRule {
	constructor(private readonly validateCacheImageRequestResizeTargetRule: ValidateCacheImageRequestResizeTargetRule) {}

	/**
	 * Validates a cache image request
	 * @param request - The cache image request to validate
	 */
	public async validate(request: CacheImageRequest): Promise<void> {
		await this.validateCacheImageRequestResizeTargetRule.validate(request)
	}
}
