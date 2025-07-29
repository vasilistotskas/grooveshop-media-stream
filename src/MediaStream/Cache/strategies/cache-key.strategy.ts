import type { CacheKeyStrategy } from '../interfaces/cache-layer.interface'
import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'

@Injectable()
export class DefaultCacheKeyStrategy implements CacheKeyStrategy {
	private readonly separator = ':'
	private readonly hashAlgorithm = 'sha256'

	generateKey(namespace: string, identifier: string, params?: Record<string, any>): string {
		const parts = [namespace, identifier]

		if (params && Object.keys(params).length > 0) {
			// Sort params for consistent key generation
			const sortedParams = Object.keys(params)
				.sort()
				.map(key => `${key}=${params[key]}`)
				.join('&')
			parts.push(this.generateHash(sortedParams))
		}

		return parts.join(this.separator)
	}

	parseKey(key: string): { namespace: string, identifier: string, params?: Record<string, any> } {
		const parts = key.split(this.separator)

		if (parts.length < 2) {
			throw new Error(`Invalid cache key format: ${key}`)
		}

		return {
			namespace: parts[0],
			identifier: parts[1],
			params: parts.length > 2 ? { hash: parts[2] } : undefined,
		}
	}

	generateHash(input: string): string {
		return createHash(this.hashAlgorithm)
			.update(input)
			.digest('hex')
			.substring(0, 16) // Use first 16 characters for shorter keys
	}
}
