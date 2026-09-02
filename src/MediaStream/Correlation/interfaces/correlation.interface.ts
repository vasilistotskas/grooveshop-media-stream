export interface RequestContext {
	correlationId: string
	timestamp: number
	clientIp: string
	userAgent?: string
	method: string
	url: string
	startTime: bigint
	endTime?: bigint
	duration?: number
	startTimestamp?: number
	endTimestamp?: number
}
