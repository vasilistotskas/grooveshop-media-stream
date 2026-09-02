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

	constructor(data?: Partial<ResourceMetaData>) {
		Object.assign(this, data)
	}
}
