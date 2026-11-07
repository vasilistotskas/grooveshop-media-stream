import type { ImageSourceConfig } from '../types/image-source.types.js'

/**
 * Every image source maps a route pattern to an upstream URL pattern.
 * `{baseUrl}` is `backend.url` (BACKEND_URL).
 */
export const IMAGE_SOURCES = {
	// A YouTube video's poster, served first-party so that a visitor's browser
	// contacts nobody but the store until they press play.
	YOUTUBE_POSTER: {
		name: 'youtube_poster',
		urlPattern: 'https://i.ytimg.com/vi/{videoId}/hqdefault.jpg',
		routePattern: 'youtube/:videoId/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: [
			'videoId',
			'width',
			'height',
			'fit',
			'position',
			'background',
			'trimThreshold',
			'quality',
			'format',
		],
	},
	// Tenant-scoped media: /media/{tenantSchema}/uploads/...
	UPLOADED_MEDIA: {
		name: 'uploaded_media',
		urlPattern: '{baseUrl}/media/{tenantSchema}/uploads/{imagePath}',
		routePattern: 'media/:tenantSchema/uploads/:imagePath+/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: [
			'tenantSchema',
			'imagePath',
			'width',
			'height',
			'fit',
			'position',
			'background',
			'trimThreshold',
			'quality',
			'format',
		],
	},
	STATIC_IMAGES: {
		name: 'static_images',
		urlPattern: '{baseUrl}/static/images/{image}',
		routePattern: 'static/images/:image/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format',
		routeParams: [
			'image',
			'width',
			'height',
			'fit',
			'position',
			'background',
			'trimThreshold',
			'quality',
			'format',
		],
	},
} as const satisfies Record<string, ImageSourceConfig>

export type ImageSourceKey = keyof typeof IMAGE_SOURCES
