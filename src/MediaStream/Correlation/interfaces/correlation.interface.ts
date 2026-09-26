import type { ImageRequestLog } from '../utils/image-request-log.util.js'

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
	/** Set by ImageRequestLogMiddleware on image-route requests only. */
	imageRequest?: ImageRequestLog
}
