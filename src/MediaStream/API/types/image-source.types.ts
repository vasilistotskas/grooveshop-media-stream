import type { StringRecord } from '#microservice/common/types/common.types'

/**
 * Defines the structure for image source configurations
 */
export interface ImageSourceConfig {
	/**
	 * Unique identifier for the source
	 */
	name: string

	/**
	 * Base URL for this source (REQUIRED)
	 * Can be:
	 * - Environment variable key (e.g., 'BACKEND_URL', 'CDN_URL')
	 * - Direct URL (e.g., 'https://api.example.com')
	 */
	baseUrl: string

	/**
	 * URL pattern for the source
	 * Supports placeholders: {baseUrl}, {path}, {param1}, {param2}, etc.
	 */
	urlPattern: string

	/**
	 * Route pattern for NestJS controller
	 * Example: 'media/uploads/:imageType/:image/:width/:height/:fit/:position/:background/:trimThreshold/:format/:quality'
	 */
	routePattern: string

	/**
	 * Parameters that should be extracted from the route
	 */
	routeParams: string[]

	/**
	 * Whether this source requires authentication
	 */
	requiresAuth?: boolean

	/**
	 * Custom headers to include in requests
	 */
	customHeaders?: StringRecord

	/**
	 * Maximum file size allowed for this source (in bytes)
	 */
	maxFileSize?: number
}

/**
 * Image processing parameters
 */
export interface ImageProcessingParams {
	imageType?: string
	image?: string
	width?: number | string | null
	height?: number | string | null
	fit?: string
	position?: string
	background?: string
	trimThreshold?: number | string
	format?: string
	quality?: number | string
	[key: string]: string | number | null | undefined
}

/**
 * Request context for image processing
 */
export interface ImageProcessingContext {
	/**
	 * Source configuration
	 */
	source: ImageSourceConfig

	/**
	 * Extracted route parameters
	 */
	params: ImageProcessingParams

	/**
	 * Correlation ID for tracking
	 */
	correlationId: string

	/**
	 * Original request URL
	 */
	originalUrl?: string
}
