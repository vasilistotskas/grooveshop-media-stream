import type { ImageSourceConfig } from '../types/image-source.types.js'

/**
 * Configuration for all image sources
 * This makes the system agnostic and extensible
 *
 * Each source can specify its own baseUrl (environment variable key or direct URL)
 * If not specified, it falls back to the default backend URL from configuration
 */
export const IMAGE_SOURCES = {
	// Tenant-scoped media: /media/{tenantSchema}/uploads/...
	UPLOADED_MEDIA: {
		name: 'uploaded_media',
		baseUrl: 'BACKEND_URL',
		urlPattern: '{baseUrl}/media/{tenantSchema}/uploads/{imagePath}',
		routePattern: 'media/:tenantSchema/uploads/:imagePath+/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: ['tenantSchema', 'imagePath', 'width', 'height', 'fit', 'position', 'background', 'trimThreshold', 'quality', 'format'],
	},
	// Legacy route (pre-multi-tenancy) for backward compatibility during migration
	UPLOADED_MEDIA_LEGACY: {
		name: 'uploaded_media_legacy',
		baseUrl: 'BACKEND_URL',
		urlPattern: '{baseUrl}/media/uploads/{imagePath}',
		routePattern: 'media/uploads/:imagePath+/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: ['imagePath', 'width', 'height', 'fit', 'position', 'background', 'trimThreshold', 'quality', 'format'],
	},
	STATIC_IMAGES: {
		name: 'static_images',
		baseUrl: 'BACKEND_URL',
		urlPattern: '{baseUrl}/static/images/{image}',
		routePattern: 'static/images/:image/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: ['image', 'width', 'height', 'fit', 'position', 'background', 'trimThreshold', 'quality', 'format'],
	},
} as const satisfies Record<string, ImageSourceConfig>

export type ImageSourceKey = keyof typeof IMAGE_SOURCES
