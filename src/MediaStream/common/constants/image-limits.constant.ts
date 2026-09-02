/**
 * Unified image processing limits
 *
 * These constants ensure consistent validation across all services.
 * Consumed by RequestValidatorService and ResourceValidationService.
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
 * Sharp `limitInputPixels` applied to every pipeline input (16383 × 16383):
 * rejects decompression-bomb sources before any pixel is decoded.
 */
export const SHARP_INPUT_PIXEL_LIMIT = 268402689

/**
 * AVIF encoding is too slow above Full HD; larger sources are encoded as WebP instead.
 */
export const AVIF_MAX_INPUT_PIXELS = 1920 * 1080

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
