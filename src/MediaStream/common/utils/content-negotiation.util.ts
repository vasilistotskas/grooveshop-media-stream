/**
 * Content negotiation utility for serving optimal image formats
 * based on client Accept header
 */

import type { Request } from 'express'
import { SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'

export interface NegotiatedFormat {
	format: SupportedResizeFormats
	quality: number
	mimeType: string
}

/**
 * Format priority order (best compression/quality ratio first)
 */
const FORMAT_PRIORITY: Array<{
	format: SupportedResizeFormats
	mimeType: string
	acceptPattern: RegExp
	defaultQuality: number
}> = [
	{
		format: SupportedResizeFormats.avif,
		mimeType: 'image/avif',
		acceptPattern: /image\/avif/i,
		defaultQuality: 70,
	},
	{
		format: SupportedResizeFormats.webp,
		mimeType: 'image/webp',
		acceptPattern: /image\/webp/i,
		defaultQuality: 80,
	},
	{
		format: SupportedResizeFormats.jpeg,
		mimeType: 'image/jpeg',
		acceptPattern: /image\/jpe?g/i,
		defaultQuality: 85,
	},
	{
		format: SupportedResizeFormats.png,
		mimeType: 'image/png',
		acceptPattern: /image\/png/i,
		defaultQuality: 90,
	},
]

/**
 * Negotiate the best image format based on Accept header
 */
export function negotiateImageFormat(
	req: Request,
	requestedFormat?: SupportedResizeFormats,
	requestedQuality?: number,
): NegotiatedFormat {
	const acceptHeader = req.headers.accept || ''

	// If a specific format is explicitly requested in the URL, always honor it
	// This ensures URL-based format requests are respected
	if (requestedFormat) {
		const formatConfig = FORMAT_PRIORITY.find(f => f.format === requestedFormat)
		if (formatConfig) {
			return {
				format: requestedFormat,
				quality: requestedQuality || formatConfig.defaultQuality,
				mimeType: formatConfig.mimeType,
			}
		}
		// Handle formats not in priority list (e.g., svg, gif)
		return {
			format: requestedFormat,
			quality: requestedQuality || 80,
			mimeType: getMimeType(requestedFormat),
		}
	}

	// No format requested - negotiate based on Accept header
	// Check Accept header for supported formats (in priority order)
	for (const formatConfig of FORMAT_PRIORITY) {
		if (formatConfig.acceptPattern.test(acceptHeader)) {
			return {
				format: formatConfig.format,
				quality: requestedQuality || formatConfig.defaultQuality,
				mimeType: formatConfig.mimeType,
			}
		}
	}

	// Default to WebP as it has the best browser support among modern formats
	return {
		format: SupportedResizeFormats.webp,
		quality: requestedQuality || 80,
		mimeType: 'image/webp',
	}
}

/**
 * Check if client supports AVIF format
 */
export function supportsAvif(req: Request): boolean {
	const acceptHeader = req.headers.accept || ''
	return /image\/avif/i.test(acceptHeader)
}

/**
 * Check if client supports WebP format
 */
export function supportsWebp(req: Request): boolean {
	const acceptHeader = req.headers.accept || ''
	return /image\/webp/i.test(acceptHeader)
}

/**
 * Get the MIME type for a format
 */
export function getMimeType(format: SupportedResizeFormats | string): string {
	const formatConfig = FORMAT_PRIORITY.find(f => f.format === format)
	if (formatConfig) {
		return formatConfig.mimeType
	}

	// Handle additional formats
	switch (format) {
		case 'svg':
			return 'image/svg+xml'
		case 'gif':
			return 'image/gif'
		case 'tiff':
			return 'image/tiff'
		default:
			return 'application/octet-stream'
	}
}

/**
 * Generate Vary header value for content negotiation
 */
export function getVaryHeader(): string {
	return 'Accept, Accept-Encoding'
}
