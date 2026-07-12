import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { access, open as fsOpen, readFile, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import { Injectable } from '@nestjs/common'
import {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	SupportedResizeFormats,
} from '#microservice/API/dto/cache-image-request.dto'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import WebpImageManipulationJob from '#microservice/Processing/jobs/webp-image-manipulation.job'
import { sanitizeSvg } from '../utils/svg-sanitizer.util.js'

export interface ProcessedImage {
	data: Buffer
	metadata: ResourceMetaData
}

/**
 * Turns a fetched temp file into processed image bytes + metadata.
 *
 * Extracted from CacheImageResourceOperation: owns SVG detection and
 * sanitization, raster processing via Sharp, and the default-image
 * fallback pipeline.
 */
@Injectable()
export class ImageFormatProcessor {
	private readonly basePath = cwd()
	// TTL values in seconds (loaded from config; metadata stores milliseconds)
	private readonly publicTtl: number
	private readonly privateTtl: number

	constructor(
		private readonly webpImageManipulationJob: WebpImageManipulationJob,
		private readonly configService: ConfigService,
	) {
		this.publicTtl = this.configService.getOptional('cache.image.publicTtl', 12 * 30 * 24 * 3600)
		this.privateTtl = this.configService.getOptional('cache.image.privateTtl', 6 * 30 * 24 * 3600)
	}

	/**
	 * Detect an SVG source by reading the file header.
	 * Reads the first 1024 bytes — enough to cover XML/DOCTYPE preamble (C14 fix).
	 */
	async detectSvgByHeader(filePath: string): Promise<boolean> {
		try {
			const fh = await fsOpen(filePath, 'r')
			try {
				const headerBuf = Buffer.alloc(1024)
				const { bytesRead } = await fh.read(headerBuf, 0, 1024, 0)
				const header = headerBuf.toString('utf8', 0, bytesRead)
				// Strip leading whitespace, XML declaration, and DOCTYPE before checking for <svg
				// so SVG files starting with <?xml ...?> are not misclassified as non-SVG.
				const stripped = header
					.trimStart()
					.replace(/^<\?xml[^?]*\?>\s*/i, '')
					.replace(/^<!DOCTYPE[^>]*>\s*/i, '')
				return stripped.trimStart().startsWith('<svg') || header.includes('xmlns="http://www.w3.org/2000/svg"')
			}
			finally {
				await fh.close()
			}
		}
		catch {
			CorrelatedLogger.debug('Could not read file header, assuming not SVG', ImageFormatProcessor.name)
			return false
		}
	}

	async processSvg(tempPath: string, resizeOptions: ResizeOptions): Promise<ProcessedImage> {
		CorrelatedLogger.debug('Processing SVG format', ImageFormatProcessor.name)

		const svgContent = await readFile(tempPath, 'utf8')

		if (!svgContent.toLowerCase().includes('<svg')) {
			CorrelatedLogger.warn('The file is not a valid SVG. Serving default WebP image.', ImageFormatProcessor.name)
			return await this.processDefault(resizeOptions)
		}

		const needsResizing = (resizeOptions?.width !== null && !Number.isNaN(resizeOptions?.width))
			|| (resizeOptions?.height !== null && !Number.isNaN(resizeOptions?.height))

		if (!needsResizing) {
			const sanitized = sanitizeSvg(svgContent)
			const data = Buffer.from(sanitized, 'utf8')
			return { data, metadata: this.buildMetadata(data.length.toString(), 'svg') }
		}
		else {
			// Sanitize the SVG before handing it to Sharp so that any embedded
			// script/SSRF vectors are stripped even when converting to raster.
			// We overwrite the temp file in-place — Sharp reads it by path.
			const sanitized = sanitizeSvg(svgContent)
			await writeFile(tempPath, sanitized, 'utf8')
			CorrelatedLogger.debug('SVG needs resizing, sanitized and converting to raster via Sharp', ImageFormatProcessor.name)
			const result = await this.webpImageManipulationJob.handle(tempPath, resizeOptions)

			return { data: result.buffer, metadata: this.buildMetadata(result.size, result.format) }
		}
	}

	async processRaster(tempPath: string, resizeOptions: ResizeOptions): Promise<ProcessedImage> {
		const result = await this.webpImageManipulationJob.handle(tempPath, resizeOptions)

		CorrelatedLogger.debug(`processRaster received result: ${JSON.stringify({ size: result.size, format: result.format })}`, ImageFormatProcessor.name)

		const requestedFormat = resizeOptions?.format
		if (requestedFormat === 'svg' && result.format !== 'svg') {
			CorrelatedLogger.debug(`SVG format requested but actual format is ${result.format}. Using actual format for content-type.`, ImageFormatProcessor.name)
		}

		return { data: result.buffer, metadata: this.buildMetadata(result.size, result.format) }
	}

	async processDefault(resizeOptions: ResizeOptions): Promise<ProcessedImage> {
		const data = await this.optimizeAndServeDefaultImage(resizeOptions)
		return { data, metadata: this.buildMetadata(data.length.toString(), 'webp') }
	}

	/**
	 * Resize/optimize the bundled default image, caching the result on disk
	 * per unique option set.
	 */
	async optimizeAndServeDefaultImage(resizeOptions: ResizeOptions): Promise<Buffer> {
		const resizeOptionsWithDefaults: ResizeOptions = {
			width: resizeOptions.width || 800,
			height: resizeOptions.height || 600,
			fit: resizeOptions.fit || FitOptions.contain,
			position: resizeOptions.position || PositionOptions.entropy,
			format: resizeOptions.format || SupportedResizeFormats.webp,
			background: resizeOptions.background || BackgroundOptions.white,
			trimThreshold: resizeOptions.trimThreshold || 5,
			quality: resizeOptions.quality || 80,
		}

		const optionsString = this.createOptionsString(resizeOptionsWithDefaults)
		const optimizedPath = path.join(this.basePath, 'storage', `default_optimized_${optionsString}.webp`)

		// Check if already cached on disk
		try {
			await access(optimizedPath)
			return await readFile(optimizedPath)
		}
		catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				const result = await this.webpImageManipulationJob.handle(
					path.join(this.basePath, 'public', 'default.png'),
					resizeOptionsWithDefaults,
				)

				if (!result) {
					throw new Error('Failed to optimize default image')
				}

				// Cache to disk for subsequent requests
				await writeFile(optimizedPath, result.buffer)
				return result.buffer
			}
			throw error
		}
	}

	private buildMetadata(size: string, format: string): ResourceMetaData {
		return new ResourceMetaData({
			version: 1,
			size,
			format,
			dateCreated: Date.now(),
			publicTTL: this.publicTtl * 1000,
			privateTTL: this.privateTtl * 1000,
		})
	}

	private createOptionsString(options: ResizeOptions): string {
		const hash = createHash('md5')
		hash.update(JSON.stringify(options))
		return hash.digest('hex')
	}
}
