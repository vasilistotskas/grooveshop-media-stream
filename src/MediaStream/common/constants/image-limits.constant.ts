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
 * Longest edge of the shrink-on-load working copy that `trim` runs on
 * (raised to twice the requested output when that is larger). Trimming the
 * full-resolution source costs a full decode; trimming a ≤1024 px copy costs
 * a fraction of it and crops to the same region.
 */
export const TRIM_WORKING_SIZE = 1024

/**
 * Source formats the pipeline accepts, as sniffed from the fetched bytes
 * (`Cache/utils/image-format-sniff.util.ts`), never from the URL extension.
 * These are the inputs Sharp decodes from a file (`sharp.format`) minus
 * libvips' own `.v` format: anything else is refused before it reaches a
 * decoder, gzip-compressed SVG included (librsvg would rasterise it without
 * the DOMPurify pass that plain SVG gets).
 */
export type SourceImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff' | 'avif' | 'svg'

/**
 * Upstream size cap per sniffed source format (bytes), enforced on the
 * declared Content-Length and again while streaming. Keyed on the content,
 * so an SVG saved as `.png` gets the SVG limit and a PNG saved as `.svg`
 * the PNG one.
 */
export const MAX_FILE_SIZES: Readonly<Record<SourceImageFormat, number>> = Object.freeze({
	jpeg: 5 * 1024 * 1024, // 5MB
	png: 8 * 1024 * 1024, // 8MB
	webp: 3 * 1024 * 1024, // 3MB
	gif: 2 * 1024 * 1024, // 2MB
	tiff: 10 * 1024 * 1024, // 10MB
	avif: 10 * 1024 * 1024, // 10MB
	svg: 1024 * 1024, // 1MB
})
