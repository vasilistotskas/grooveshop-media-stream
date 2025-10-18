import type { ImageSourceConfig } from '../types/image-source.types.js'

/**
 * Configuration for all image sources
 * This makes the system agnostic and extensible
 */
export const IMAGE_SOURCES = {
	UPLOADED_MEDIA: {
		name: 'uploaded_media',
		urlPattern: '{baseUrl}/media/uploads/{imageType}/{image}',
		routePattern: 'media/uploads/:imageType/:image/:width/:height/:fit/:position/:background/:trimThreshold/:format/:quality',
		routeParams: ['imageType', 'image', 'width', 'height', 'fit', 'position', 'background', 'trimThreshold', 'format', 'quality'],
	},
	STATIC_IMAGES: {
		name: 'static_images',
		urlPattern: '{baseUrl}/static/images/{image}',
		routePattern: 'static/images/:image/:width/:height/:fit/:position/:background/:trimThreshold/:format/:quality',
		routeParams: ['image', 'width', 'height', 'fit', 'position', 'background', 'trimThreshold', 'format', 'quality'],
	},
} as const satisfies Record<string, ImageSourceConfig>

export type ImageSourceKey = keyof typeof IMAGE_SOURCES
