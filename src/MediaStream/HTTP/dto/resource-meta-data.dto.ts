export const defaultPrivateTTL = 6 * 30 * 24 * 60 * 60 * 1000
export const defaultPublicTTL = 12 * 30 * 24 * 60 * 60 * 1000
export const resourceMetaVersion = 1

export default class ResourceMetaData {
	version: number
	size: string = ''
	format: string = ''
	dateCreated: number = Date.now()
	privateTTL: number
	publicTTL: number
	accessCount: number = 0
	// Tenant schema the resource belongs to. Persisted in the .rsm file
	// so the cache-warming service can rebuild the correct
	// ``image:{tenantSchema}`` namespace key without re-parsing the
	// originating URL (H21 in MULTI_TENANT_AUDIT.md). Legacy entries
	// without this field fall back to ``'public'`` at read-time so the
	// upgrade is forward-only.
	tenantSchema: string = 'public'

	constructor(data?: Partial<ResourceMetaData>) {
		this.version = data?.version ?? resourceMetaVersion
		this.publicTTL = data?.publicTTL ?? defaultPublicTTL
		this.privateTTL = data?.privateTTL ?? defaultPrivateTTL
		Object.assign(this, data)
	}
}
