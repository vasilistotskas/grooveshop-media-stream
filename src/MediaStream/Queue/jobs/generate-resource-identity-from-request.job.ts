import type CacheImageRequest from '#microservice/API/dto/cache-image-request.dto'
import type { ResourceIdentifierKP } from '#microservice/common/constants/key-properties.constant'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { Injectable } from '@nestjs/common'

const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8'

function generateUUIDv5(name: string, namespace: string = NAMESPACE_URL): string {
	const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex')
	const hash = createHash('sha1').update(Buffer.concat([ns, Buffer.from(name)])).digest()

	hash[6] = (hash[6] & 0x0F) | 0x50
	hash[8] = (hash[8] & 0x3F) | 0x80

	const hex = hash.subarray(0, 16).toString('hex')
	return (
		`${hex.substring(0, 8)}-`
		+ `${hex.substring(8, 12)}-`
		+ `${hex.substring(12, 16)}-`
		+ `${hex.substring(16, 20)}-`
		+ `${hex.substring(20)}`
	)
}

/**
 * Generates unique resource identifiers from cache image requests.
 * Stateless service - all request data is passed via method parameters.
 */
@Injectable()
export default class GenerateResourceIdentityFromRequestJob {
	async handle(cacheImageRequest: CacheImageRequest): Promise<ResourceIdentifierKP> {
		const request = JSON.parse(JSON.stringify(cacheImageRequest))
		const requestStr = JSON.stringify(request)
		return generateUUIDv5(requestStr)
	}
}
