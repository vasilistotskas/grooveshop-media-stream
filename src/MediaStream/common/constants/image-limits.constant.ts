/**
 * Unified image processing limits
 *
 * These constants ensure consistent validation across all services.
 * Any changes here will affect both RequestValidatorService and InputSanitizationService.
 */

/**
 * Maximum allowed width for image processing (pixels)
 */
export const MAX_IMAGE_WIDTH = 8192

/**
 * Maximum allowed height for image processing (pixels)
 */
export const MAX_IMAGE_HEIGHT = 8192

/**
 * Maximum total pixels allowed (width * height)
 * Based on 8K resolution (7680 x 4320)
 */
export const MAX_TOTAL_PIXELS = 7680 * 4320

/**
 * Minimum allowed dimension (pixels)
 */
export const MIN_IMAGE_DIMENSION = 1

/**
 * Quality range for image compression
 */
export const MIN_QUALITY = 1
export const MAX_QUALITY = 100

/**
 * Trim threshold range
 */
export const MIN_TRIM_THRESHOLD = 0
export const MAX_TRIM_THRESHOLD = 100

/**
 * Maximum file sizes by format (in bytes)
 */
export const MAX_FILE_SIZES = Object.freeze({
	default: 10 * 1024 * 1024, // 10MB
	jpeg: 5 * 1024 * 1024, // 5MB
	jpg: 5 * 1024 * 1024, // 5MB
	png: 8 * 1024 * 1024, // 8MB
	webp: 3 * 1024 * 1024, // 3MB
	gif: 2 * 1024 * 1024, // 2MB
	svg: 1024 * 1024, // 1MB
})

/**
 * Maximum string length for sanitized inputs
 */
export const MAX_STRING_LENGTH = 2048
