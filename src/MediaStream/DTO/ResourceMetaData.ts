export const defaultPrivateTTL = 6 * 30 * 24 * 60 * 60 * 1000
export const defaultPublicTTL = 12 * 30 * 24 * 60 * 60 * 1000
export const resourceMetaVersion = 1

export default class ResourceMetaData {
	version: number
	size: string
	format: string
	dateCreated: number
	privateTTL: number
	publicTTL: number

	constructor(data?: Partial<ResourceMetaData>) {
		this.version = data?.version ?? resourceMetaVersion
		this.publicTTL = data?.publicTTL ?? defaultPublicTTL
		this.privateTTL = data?.privateTTL ?? defaultPrivateTTL
		Object.assign(this, data)
	}
}
