import { FitOptions, PositionOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { MAX_IMAGE_HEIGHT, MAX_TOTAL_PIXELS } from '#microservice/common/constants/image-limits.constant'
import { MAX_RENDITION_WIDTH, RENDITION_QUALITIES, RENDITION_WIDTHS } from '#microservice/common/constants/rendition-presets.constant'

/** The resize parameters a preset is chosen from; every field is validated before this runs. */
export interface RenditionRequest {
	width: number
	height: number
	fit: FitOptions
	position: string
	format: SupportedResizeFormats
	quality: number
}

/** The parameters the preset replaces; the rest of the request is already canonical. */
export interface Rendition {
	width: number
	height: number
	position: string
	quality: number
}

/** The smallest step of `ladder` at or above `value`, or the last step when `value` is beyond it. */
function snapUp(value: number, ladder: readonly number[]): number {
	return ladder.find(step => step >= value) ?? ladder[ladder.length - 1]
}

/**
 * Width and height of the preset a request maps to.
 *
 * The bounded axis snaps up to the width ladder. With both axes set the
 * height follows the snapped width at the requested aspect ratio, so a `cover`
 * crop keeps its shape. Both axes 0 (the original size) becomes a bound at the
 * widest preset. A request the snap would push outside the pixel budget (an
 * extreme aspect ratio) is kept as asked: it is not a preset and is validated
 * like any other.
 */
function snapDimensions(width: number, height: number): { width: number, height: number } {
	if (width > 0 && height > 0) {
		const snappedWidth = Math.min(snapUp(width, RENDITION_WIDTHS), MAX_RENDITION_WIDTH)
		const snappedHeight = Math.max(1, Math.round(height * snappedWidth / width))
		return snappedHeight <= MAX_IMAGE_HEIGHT && snappedWidth * snappedHeight <= MAX_TOTAL_PIXELS
			? { width: snappedWidth, height: snappedHeight }
			: { width, height }
	}
	if (width > 0) {
		return {
			width: snapUp(width, RENDITION_WIDTHS),
			height: 0,
		}
	}
	if (height > 0) {
		return {
			width: 0,
			height: snapUp(height, RENDITION_WIDTHS),
		}
	}
	return { width: MAX_RENDITION_WIDTH, height: 0 }
}

/**
 * Where the crop or the padding sits only matters for `cover` and `contain`
 * (Sharp's `position` option); the other fits ignore it, so they share one
 * entry. `centre` is Sharp's alias of `center`.
 */
function canonicalPosition(fit: FitOptions, position: string): string {
	if (fit !== FitOptions.cover && fit !== FitOptions.contain) {
		return PositionOptions.center
	}
	return position === PositionOptions.centre
		? PositionOptions.center
		: position
}

/**
 * AVIF is capped at `avifMaxQuality` (the one number that decides it, so a
 * request at 80 and one at 100 name one entry). GIF and TIFF output ignore
 * quality. The other lossy formats round up to `RENDITION_QUALITIES`.
 */
function canonicalQuality(format: SupportedResizeFormats, quality: number, avifMaxQuality: number): number {
	switch (format) {
		case SupportedResizeFormats.avif:
			return Math.min(quality, avifMaxQuality)
		case SupportedResizeFormats.gif:
		case SupportedResizeFormats.tiff:
			return RENDITION_QUALITIES[RENDITION_QUALITIES.length - 1]
		default:
			return snapUp(quality, RENDITION_QUALITIES)
	}
}

/**
 * The preset a request is answered with. Pure and idempotent: a preset maps
 * to itself, which is what lets pre-generated renditions and live requests
 * share one cache identity.
 */
export function toRendition(request: RenditionRequest, avifMaxQuality: number): Rendition {
	return {
		...snapDimensions(request.width, request.height),
		position: canonicalPosition(request.fit, request.position),
		quality: canonicalQuality(request.format, request.quality, avifMaxQuality),
	}
}
