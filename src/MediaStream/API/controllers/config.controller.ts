import { IMAGE } from '#microservice/common/constants/route-prefixes.constant'
import { Controller, Get } from '@nestjs/common'
import { IMAGE_SOURCES } from '../config/image-sources.config.js'
import {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	SupportedResizeFormats,
} from '../dto/cache-image-request.dto.js'

/**
 * Controller for serving API configuration and metadata
 */
@Controller('config')
export class ConfigController {
	/**
	 * Get image sources configuration
	 * Used by the frontend to dynamically generate documentation
	 */
	@Get('image-sources')
	getImageSources(): {
		sources: typeof IMAGE_SOURCES
		options: {
			fit: string[]
			position: string[]
			background: string[]
			format: string[]
		}
		defaults: {
			fit: FitOptions
			position: PositionOptions
			background: BackgroundOptions
			trimThreshold: number
			quality: number
			format: SupportedResizeFormats
		}
		baseUrl: string
	} {
		return {
			sources: IMAGE_SOURCES,
			options: {
				fit: Object.values(FitOptions),
				position: Object.values(PositionOptions),
				background: Object.values(BackgroundOptions),
				format: Object.values(SupportedResizeFormats),
			},
			defaults: {
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: BackgroundOptions.transparent,
				trimThreshold: 5,
				quality: 80,
				format: SupportedResizeFormats.webp,
			},
			baseUrl: `/${IMAGE}`,
		}
	}
}
