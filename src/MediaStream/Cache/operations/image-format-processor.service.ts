import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { open, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { Injectable } from '@nestjs/common'
import { SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { PUBLIC_TENANT_SCHEMA } from '#microservice/common/constants/tenant.constant'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ResourceMetaData, { resourceMetaVersion } from '#microservice/HTTP/dto/resource-meta-data.dto'
import WebpImageManipulationJob, { outputFormat } from '#microservice/Processing/jobs/webp-image-manipulation.job'
import { isSvgHeader, sanitizeSvg, SVG_SNIFF_BYTES } from '../utils/svg-sanitizer.util.js'

export interface ProcessedImage {
	data: Buffer
	metadata: ResourceMetaData
}

/** Dimensions of the fallback image when the request asked for the original size. */
const DEFAULT_IMAGE_WIDTH = 800
const DEFAULT_IMAGE_HEIGHT = 600

/**
 * Turns a fetched temp file into processed image bytes + metadata: SVG
 * detection and sanitisation, raster processing via Sharp, and the
 * default-image fallback pipeline.
 */
@Injectable()
export class ImageFormatProcessor {
	private readonly storageDir: string
	private readonly defaultImagePath = join(cwd(), 'public', 'default.png')
	// TTL values in seconds (loaded from config; metadata stores milliseconds)
	private readonly publicTtl: number
	private readonly privateTtl: number

	constructor(
		private readonly webpImageManipulationJob: WebpImageManipulationJob,
		configService: ConfigService,
	) {
		this.publicTtl = configService.get('cache.image.publicTtl')
		this.privateTtl = configService.get('cache.image.privateTtl')
		this.storageDir = storageDirectory(configService)
	}

	/** Detect an SVG source from its first bytes; unreadable files are treated as raster. */
	async detectSvgByHeader(filePath: string): Promise<boolean> {
		try {
			const fh = await open(filePath, 'r')
			try {
				const headerBuf = Buffer.alloc(SVG_SNIFF_BYTES)
				const { bytesRead } = await fh.read(headerBuf, 0, SVG_SNIFF_BYTES, 0)
				return isSvgHeader(headerBuf.toString('utf8', 0, bytesRead))
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

	async processSvg(tempPath: string, resizeOptions: ResizeOptions, tenantSchema: string = PUBLIC_TENANT_SCHEMA): Promise<ProcessedImage> {
		const svgContent = await readFile(tempPath, 'utf8')

		if (!svgContent.toLowerCase().includes('<svg')) {
			CorrelatedLogger.warn('The file is not a valid SVG. Serving the default image.', ImageFormatProcessor.name)
			return this.processDefault(resizeOptions, tenantSchema)
		}

		// Sanitise before the bytes reach either a browser (served as
		// image/svg+xml) or Sharp (rasterised): strips script and SSRF vectors.
		const sanitized = sanitizeSvg(svgContent)
		const needsResizing = (resizeOptions.width ?? 0) > 0 || (resizeOptions.height ?? 0) > 0

		if (!needsResizing) {
			const data = Buffer.from(sanitized, 'utf8')
			return { data, metadata: this.buildMetadata(String(data.length), SupportedResizeFormats.svg, tenantSchema) }
		}

		// Sharp reads by path — overwrite the temp file with the sanitised markup.
		await writeFile(tempPath, sanitized, 'utf8')
		CorrelatedLogger.debug('SVG needs resizing, sanitized and converting to raster via Sharp', ImageFormatProcessor.name)
		const result = await this.webpImageManipulationJob.handle(tempPath, resizeOptions)
		return { data: result.buffer, metadata: this.buildMetadata(result.size, result.format, tenantSchema) }
	}

	async processRaster(tempPath: string, resizeOptions: ResizeOptions, tenantSchema: string = PUBLIC_TENANT_SCHEMA): Promise<ProcessedImage> {
		const result = await this.webpImageManipulationJob.handle(tempPath, resizeOptions)
		return { data: result.buffer, metadata: this.buildMetadata(result.size, result.format, tenantSchema) }
	}

	async processDefault(resizeOptions: ResizeOptions, tenantSchema: string = PUBLIC_TENANT_SCHEMA): Promise<ProcessedImage> {
		const data = await this.optimizeAndServeDefaultImage(resizeOptions)
		return { data, metadata: this.buildMetadata(String(data.length), outputFormat(resizeOptions.format), tenantSchema) }
	}

	/**
	 * Resize/optimize the bundled default image, caching the result on disk
	 * per unique option set.
	 */
	async optimizeAndServeDefaultImage(resizeOptions: ResizeOptions): Promise<Buffer> {
		const options: ResizeOptions = {
			...resizeOptions,
			width: resizeOptions.width || DEFAULT_IMAGE_WIDTH,
			height: resizeOptions.height || DEFAULT_IMAGE_HEIGHT,
		}
		const optimizedPath = join(this.storageDir, `default_optimized_${this.createOptionsString(options)}.webp`)

		try {
			return await readFile(optimizedPath)
		}
		catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error
			}
		}

		const result = await this.webpImageManipulationJob.handle(this.defaultImagePath, options)
		await writeFile(optimizedPath, result.buffer)
		return result.buffer
	}

	private buildMetadata(size: string, format: string, tenantSchema: string): ResourceMetaData {
		return new ResourceMetaData({
			version: resourceMetaVersion,
			size,
			format,
			dateCreated: Date.now(),
			publicTTL: this.publicTtl * 1000,
			privateTTL: this.privateTtl * 1000,
			tenantSchema,
		})
	}

	private createOptionsString(options: ResizeOptions): string {
		return createHash('md5').update(JSON.stringify(options)).digest('hex')
	}
}
