import { describe, expect, it } from 'vitest'
import { SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { getMimeType } from '#microservice/common/utils/content-negotiation.util'

describe('getMimeType', () => {
	it('resolves the priority formats to their image MIME types', () => {
		expect(getMimeType(SupportedResizeFormats.avif)).toBe('image/avif')
		expect(getMimeType(SupportedResizeFormats.webp)).toBe('image/webp')
		expect(getMimeType(SupportedResizeFormats.jpeg)).toBe('image/jpeg')
		expect(getMimeType(SupportedResizeFormats.png)).toBe('image/png')
	})

	it('resolves additional vector/legacy formats', () => {
		expect(getMimeType('svg')).toBe('image/svg+xml')
		expect(getMimeType('gif')).toBe('image/gif')
		expect(getMimeType('tiff')).toBe('image/tiff')
	})

	// Sharp/libvips reports AVIF output as 'heif'. Entries cached before the
	// job-level heif→avif normalisation still carry format 'heif' in their
	// metadata, so getMimeType must map it to image/avif rather than fall
	// through to application/octet-stream. See lovell/sharp#2504.
	it('maps Sharp\'s heif output format to image/avif', () => {
		expect(getMimeType('heif')).toBe('image/avif')
	})

	it('falls back to application/octet-stream for unknown formats', () => {
		expect(getMimeType('unknown')).toBe('application/octet-stream')
	})
})
