/**
 * Defines the structure for image source configurations
 */
export interface ImageSourceConfig {
	/**
	 * Unique identifier for the source
	 */
	name: string

	/**
	 * URL pattern for the upstream resource. Supports `{baseUrl}` plus one
	 * placeholder per route param, e.g. `{tenantSchema}`, `{imagePath}`.
	 */
	urlPattern: string

	/**
	 * Route pattern matched by the controller. `:param+` captures nested
	 * paths (blog/post/main/image.jpg); `:quality.:format` splits on the dot.
	 */
	routePattern: string

	/**
	 * Parameters extracted from the route, in capture-group order
	 */
	routeParams: string[]
}

/**
 * Route parameters. Regex captures are always strings; the named fields exist
 * so call sites keep dot access under `noPropertyAccessFromIndexSignature`.
 */
export interface ImageProcessingParams {
	[key: string]: string | undefined
	tenantSchema?: string
	imagePath?: string
	image?: string
	width?: string
	height?: string
	fit?: string
	position?: string
	background?: string
	trimThreshold?: string
	quality?: string
	format?: string
}

/**
 * Request context for image processing
 */
export interface ImageProcessingContext {
	source: ImageSourceConfig
	params: ImageProcessingParams
	correlationId: string
}
