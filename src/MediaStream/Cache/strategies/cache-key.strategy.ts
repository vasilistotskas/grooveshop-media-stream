import type { StringMap } from '#microservice/common/types/common.types'
import type { CacheKeyStrategy } from '../interfaces/cache-layer.interface.js'
import { Injectable } from '@nestjs/common'

@Injectable()
export class DefaultCacheKeyStrategy implements CacheKeyStrategy {
	private readonly separator = ':'

	generateKey(namespace: string, identifier: string, params?: StringMap): string {
		const parts = [namespace, identifier]

		if (params && Object.keys(params).length > 0) {
			const sortedParams = Object.keys(params)
				.sort()
				.map(key => `${key}=${params[key]}`)
				.join('&')
			parts.push(this.generateHash(sortedParams))
		}

		return parts.join(this.separator)
	}

	parseKey(key: string): { namespace: string, identifier: string, params?: StringMap } {
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

	/**
	 * Fast DJB2-based hash — no crypto overhead needed for cache key distribution.
	 * Returns a 16-char hex string for uniform key distribution.
	 */
	generateHash(input: string): string {
		let h1 = 0xDEADBEEF
		let h2 = 0x41C6CE57
		for (let i = 0; i < input.length; i++) {
			const ch = input.charCodeAt(i)
			h1 = Math.imul(h1 ^ ch, 2654435761)
			h2 = Math.imul(h2 ^ ch, 1597334677)
		}
		h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
		h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
		const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0)
		return combined.toString(36).padStart(12, '0').substring(0, 16)
	}
}
