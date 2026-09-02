import type { ImageProcessingContext } from '../types/image-source.types.js'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

/**
 * Builds upstream resource URLs from a source's URL pattern and the route params.
 */
@Injectable()
export class UrlBuilderService {
	private readonly baseUrl: string

	constructor(configService: ConfigService) {
		this.baseUrl = configService.get<string>('backend.url')
	}

	buildResourceUrl(context: ImageProcessingContext): string {
		const { source, params } = context

		let url = source.urlPattern.replace('{baseUrl}', this.baseUrl)

		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				url = url.replace(`{${key}}`, encodeURIComponent(value))
			}
		}

		CorrelatedLogger.debug(`Built resource URL for ${source.name}: ${url}`, UrlBuilderService.name)

		return url
	}
}
