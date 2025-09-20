export interface RequestContext {
	correlationId: string
	timestamp: number
	userId?: string
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

export interface CorrelationService {
	generateCorrelationId: () => string
	setContext: (context: RequestContext) => void
	getContext: () => RequestContext | null
	getCorrelationId: () => string | null
	clearContext: () => void
}

export interface TimingInfo {
	startTime: number
	endTime?: number
	duration?: number
	phase: string
}
