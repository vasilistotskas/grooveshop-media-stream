import type { CacheLayerName } from '#microservice/Cache/interfaces/cache-layer.interface'
import type { SourceImageFormat } from '#microservice/common/constants/image-limits.constant'
import { requestContextStorage } from '../async-local-storage.js'

/**
 * How an image request ended. A closed set: it is the `outcome` log field
 * and a Prometheus label.
 *
 * - `ok`: the image was served, from a cache tier or freshly processed
 * - `not_modified`: 304 from a conditional request
 * - `fallback`: the default image was served because fetching or processing failed
 * - `rejected`: the default image was served because the source was refused:
 *   over its format's size limit, not a supported format, or an SVG the
 *   sanitiser failed closed on (logged at WARN)
 * - `overloaded` / `timeout`: 503 from admission control / a pipeline deadline
 * - `invalid`: any other 4xx (validation, unknown route)
 * - `rate_limited`: 429
 * - `error`: any other 5xx
 * - `aborted`: the client closed the connection before the response finished
 */
export type ImageRequestOutcome
	= | 'ok'
		| 'not_modified'
		| 'fallback'
		| 'rejected'
		| 'overloaded'
		| 'timeout'
		| 'invalid'
		| 'rate_limited'
		| 'error'
		| 'aborted'

/** Where a request's bytes came from: a layered cache (`memory`, `redis`), the on-disk tier, or none. */
export type ImageCacheResult = CacheLayerName | 'disk' | 'miss'

/**
 * Everything the one structured line of an image request carries,
 * accumulated along the pipeline. Created by ImageRequestLogMiddleware and
 * reachable from any code running for that request through
 * `currentImageRequest()`; every writer treats it as optional, so code that
 * runs outside a request (cache warming, specs) writes nothing.
 */
export interface ImageRequestLog {
	readonly correlationId: string
	readonly startedAt: bigint
	/** Request path under the image route, percent-decoded once the controller has decoded it; never the query string. */
	path: string
	source?: string
	schema?: string
	width?: number
	height?: number
	fit?: string
	position?: string
	format?: string
	quality?: number
	cache?: ImageCacheResult
	/** True when the request waited on another request's fetch + process of the same resource. */
	coalesced?: boolean
	inputFormat?: SourceImageFormat
	inputBytes?: number
	outputFormat?: string
	outputBytes?: number
	/** Time spent waiting for a processing slot, summed over every pipeline the request ran. */
	admissionWaitMs: number
	outcome?: ImageRequestOutcome
	/** Class name of the error that decided the response, if any. */
	error?: string
}

/** Logger context of the line written just before a fetched source is decoded (CacheImageResourceOperation). */
export const IMAGE_DECODE_LOG_CONTEXT = 'ImageDecode'

/** The image request the calling code runs for, if any. */
export function currentImageRequest(): ImageRequestLog | undefined {
	return requestContextStorage.getStore()?.imageRequest
}
