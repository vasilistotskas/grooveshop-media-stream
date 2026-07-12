import type { ImageProcessingContext, ImageSourceConfig } from '../types/image-source.types.js'
import * as process from 'node:process'
import { Injectable } from '@nestjs/common'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

/**
 * Service responsible for building resource URLs from configurations
 */
@Injectable()
export class UrlBuilderService {
	/**
	 * Build a resource URL from source configuration and parameters
	 */
	buildResourceUrl(context: ImageProcessingContext): string {
		const { source, params } = context
		const baseUrl = this.getBaseUrlForSource(source)

		let url = source.urlPattern.replace('{baseUrl}', baseUrl)

		for (const [key, value] of Object.entries(params)) {
			if (value !== null && value !== undefined) {
				const placeholder = `{${key}}`
				if (url.includes(placeholder)) {
					url = url.replace(placeholder, encodeURIComponent(String(value)))
				}
			}
		}

		CorrelatedLogger.debug(`Built resource URL for ${source.name}: ${url}`, UrlBuilderService.name)

		return url
	}

	/**
	 * Get the appropriate base URL for a source
	 * Supports:
	 * 1. Direct URL in source.baseUrl (e.g., 'https://api.example.com')
	 * 2. Environment variable key in source.baseUrl (e.g., 'BACKEND_URL')
	 */
	private getBaseUrlForSource(source: ImageSourceConfig): string {
		if (!source.baseUrl) {
			throw new Error(`Image source '${source.name}' must specify a baseUrl`)
		}

		if (source.baseUrl.startsWith('http://') || source.baseUrl.startsWith('https://')) {
			return source.baseUrl
		}

		const envValue = process.env[source.baseUrl]
		if (!envValue) {
			throw new Error(
				`Environment variable '${source.baseUrl}' not found for image source '${source.name}'`,
			)
		}

		return envValue
	}
}
