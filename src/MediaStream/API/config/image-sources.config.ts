import type { ImageSourceConfig } from '../types/image-source.types.js'

/**
 * Configuration for all image sources
 * This makes the system agnostic and extensible
 *
 * Each source can specify its own baseUrl (environment variable key or direct URL)
 * If not specified, it falls back to the default backend URL from configuration
 */
export const IMAGE_SOURCES = {
	UPLOADED_MEDIA: {
		name: 'uploaded_media',
		baseUrl: 'BACKEND_URL', // Environment variable key
		urlPattern: '{baseUrl}/media/uploads/{imagePath}',
		// Use wildcard to capture full nested path (e.g., blog/post/main/image.jpg)
		routePattern: 'media/uploads/:imagePath+/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: ['imagePath', 'width', 'height', 'fit', 'position', 'background', 'trimThreshold', 'quality', 'format'],
	},
	STATIC_IMAGES: {
		name: 'static_images',
		baseUrl: 'BACKEND_URL', // Environment variable key
		urlPattern: '{baseUrl}/static/images/{image}',
		routePattern: 'static/images/:image/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: ['image', 'width', 'height', 'fit', 'position', 'background', 'trimThreshold', 'quality', 'format'],
	},
} as const satisfies Record<string, ImageSourceConfig>

export type ImageSourceKey = keyof typeof IMAGE_SOURCES
