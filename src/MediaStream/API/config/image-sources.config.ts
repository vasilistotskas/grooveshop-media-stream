import type { ImageSourceConfig } from '../types/image-source.types.js'

/**
 * Every image source maps a route pattern to an upstream URL pattern.
 * `{baseUrl}` is `backend.url` (BACKEND_URL).
 */
export const IMAGE_SOURCES = {
	// Tenant-scoped media: /media/{tenantSchema}/uploads/...
	UPLOADED_MEDIA: {
		name: 'uploaded_media',
		urlPattern: '{baseUrl}/media/{tenantSchema}/uploads/{imagePath}',
		routePattern: 'media/:tenantSchema/uploads/:imagePath+/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: ['tenantSchema', 'imagePath', 'width', 'height', 'fit', 'position', 'background', 'trimThreshold', 'quality', 'format'],
	},
	STATIC_IMAGES: {
		name: 'static_images',
		urlPattern: '{baseUrl}/static/images/{image}',
		routePattern: 'static/images/:image/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: ['image', 'width', 'height', 'fit', 'position', 'background', 'trimThreshold', 'quality', 'format'],
	},
} as const satisfies Record<string, ImageSourceConfig>

export type ImageSourceKey = keyof typeof IMAGE_SOURCES
