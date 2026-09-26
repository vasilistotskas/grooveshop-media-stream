import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { Injectable } from '@nestjs/common'
import { SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { PUBLIC_TENANT_SCHEMA } from '#microservice/common/constants/tenant.constant'
import { UnsupportedSourceFormatError } from '#microservice/common/errors/media-stream.errors'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ResourceMetaData, { resourceMetaVersion } from '#microservice/HTTP/dto/resource-meta-data.dto'
import WebpImageManipulationJob from '#microservice/Processing/jobs/webp-image-manipulation.job'
import { ProcessingAdmissionService } from '#microservice/Processing/services/processing-admission.service'
import { sanitizeSvg } from '../utils/svg-sanitizer.util.js'

export interface ProcessedImage {
	data: Buffer
	metadata: ResourceMetaData
}

/** Dimensions of the fallback image when the request asked for the original size. */
const DEFAULT_IMAGE_WIDTH = 800
const DEFAULT_IMAGE_HEIGHT = 600

/**
 * Turns a fetched temp file into processed image bytes + metadata: SVG
 * sanitisation, raster processing via Sharp, and the
 * default-image fallback pipeline. Every Sharp pipeline and every SVG
 * sanitisation goes through ProcessingAdmissionService so a burst of misses
 * is queued and shed instead of oversubscribing the CPU.
 */
@Injectable()
export class ImageFormatProcessor {
	private readonly storageDir: string
	private readonly defaultImagePath = join(cwd(), 'public', 'default.png')
	// TTL values in seconds (loaded from config; metadata stores milliseconds)
	private readonly publicTtl: number
	private readonly privateTtl: number
	/** Same budget as a Sharp pipeline (`PROCESSING_TIMEOUT_SECONDS`). */
	private readonly timeoutSeconds: number

	constructor(
		private readonly webpImageManipulationJob: WebpImageManipulationJob,
		private readonly admission: ProcessingAdmissionService,
		configService: ConfigService,
	) {
		this.publicTtl = configService.get('cache.image.publicTtl')
		this.privateTtl = configService.get('cache.image.privateTtl')
		this.timeoutSeconds = Math.max(0, configService.get<number>('processing.timeoutSeconds'))
		this.storageDir = storageDirectory(configService)
	}

	/**
	 * A source the fetcher sniffed as SVG.
	 * @throws UnsupportedSourceFormatError when the document has no `<svg>` element
	 * @throws SvgSanitizationError when the sanitiser fails closed
	 */
	async processSvg(tempPath: string, resizeOptions: ResizeOptions, tenantSchema: string = PUBLIC_TENANT_SCHEMA): Promise<ProcessedImage> {
		const svgContent = await readFile(tempPath, 'utf8')

		if (!svgContent.toLowerCase().includes('<svg')) {
			throw new UnsupportedSourceFormatError('SVG document without an <svg> element')
		}

		// Sanitise before the bytes reach either a browser (served as
		// image/svg+xml) or Sharp (rasterised): strips script and SSRF vectors.
		// Admitted like a Sharp pipeline: the jsdom parse is CPU- and memory-heavy.
		const sanitized = await this.admission.run(() => sanitizeSvg(svgContent, { timeoutMs: this.timeoutSeconds * 1000 }))
		const needsResizing = (resizeOptions.width ?? 0) > 0 || (resizeOptions.height ?? 0) > 0

		if (!needsResizing) {
			const data = Buffer.from(sanitized, 'utf8')
			return { data, metadata: this.buildMetadata(String(data.length), SupportedResizeFormats.svg, tenantSchema) }
		}

		// Sharp reads by path — overwrite the temp file with the sanitised markup.
		await writeFile(tempPath, sanitized, 'utf8')
		CorrelatedLogger.debug('SVG needs resizing, sanitized and converting to raster via Sharp', ImageFormatProcessor.name)
		const result = await this.runJob(tempPath, resizeOptions)
		return { data: result.buffer, metadata: this.buildMetadata(result.size, result.format, tenantSchema) }
	}

	async processRaster(tempPath: string, resizeOptions: ResizeOptions, tenantSchema: string = PUBLIC_TENANT_SCHEMA): Promise<ProcessedImage> {
		const result = await this.runJob(tempPath, resizeOptions)
		return { data: result.buffer, metadata: this.buildMetadata(result.size, result.format, tenantSchema) }
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

		const result = await this.runJob(this.defaultImagePath, options)
		await writeFile(optimizedPath, result.buffer)
		return result.buffer
	}

	private runJob(path: string, resizeOptions: ResizeOptions): ReturnType<WebpImageManipulationJob['handle']> {
		return this.admission.run(() => this.webpImageManipulationJob.handle(path, resizeOptions))
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
