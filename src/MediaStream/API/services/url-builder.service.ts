import type { ImageProcessingContext, ImageSourceConfig } from '../types/image-source.types.js'
import * as process from 'node:process'
import { Injectable, Logger } from '@nestjs/common'

/**
 * Service responsible for building resource URLs from configurations
 */
@Injectable()
export class UrlBuilderService {
	private readonly _logger = new Logger(UrlBuilderService.name)

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

		this._logger.debug('Built resource URL', {
			source: source.name,
			url,
			correlationId: context.correlationId,
		})

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
