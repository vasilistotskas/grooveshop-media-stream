const MIME_TYPES: Readonly<Record<string, string>> = Object.freeze({
	avif: 'image/avif',
	webp: 'image/webp',
	jpeg: 'image/jpeg',
	png: 'image/png',
	svg: 'image/svg+xml',
	gif: 'image/gif',
	tiff: 'image/tiff',
	// remove after 2026-12-26: sidecars written before 2026-06-29 may carry format 'heif'
	heif: 'image/avif',
})

/**
 * Content-Type for a stored/processed image format; unknown formats are served as octet-stream.
 */
export function getMimeType(format: string): string {
	return MIME_TYPES[format] ?? 'application/octet-stream'
}
