import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { PUBLIC_TENANT_SCHEMA } from '#microservice/common/constants/tenant.constant'

export const resourceMetaVersion = 1

/**
 * Sidecar (`.rsm`) shape and the metadata half of every cache payload.
 * TTLs are milliseconds and are always supplied by the writer; an instance
 * without them is expired by construction.
 */
export default class ResourceMetaData {
	version: number = resourceMetaVersion
	size: string = ''
	format: string = ''
	dateCreated: number = Date.now()
	privateTTL: number = 0
	publicTTL: number = 0
	accessCount: number = 0
	/** Tenant the resource belongs to; cache warming rebuilds the `image:{tenantSchema}` namespace from it. */
	tenantSchema: string = PUBLIC_TENANT_SCHEMA
	/** The source this rendition was made from, relative to the tenant's uploads (`blog/a.png`); null for any other source. */
	source: string | null = null
	/** The resize options the rendition was hashed from, so the renditions of one source can be made for another. */
	resizeOptions: ResizeOptions | null = null

	constructor(data?: Partial<ResourceMetaData>) {
		Object.assign(this, data)
	}
}
