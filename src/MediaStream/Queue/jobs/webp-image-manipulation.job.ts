import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import { extname } from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'
import ManipulationJobResult from '../dto/manipulation-job-result.dto.js'

/**
 * Handles image manipulation and format conversion using Sharp.
 * Stateless service - all request data is passed via method parameters.
 * Returns processed image as a Buffer (no intermediate disk I/O).
 */
@Injectable()
export default class WebpImageManipulationJob {
	private readonly logger = new Logger(WebpImageManipulationJob.name)

	/**
	 * Process an image from a file path.
	 * Supports SVG detection/handling and all raster formats.
	 */
	async handle(
		filePathFrom: string,
		options: ResizeOptions,
	): Promise<ManipulationJobResult> {
		this.logger.debug(`WebpImageManipulationJob.handle called with options:`, {
			filePathFrom,
			options: JSON.stringify(options, null, 2),
		})

		if (options.format === 'svg') {
			return this.handleSvgFormat(filePathFrom, options)
		}

		return this.processRaster(filePathFrom, options)
	}

	/**
	 * Process an image from a Buffer.
	 * Used by the queue processor for background jobs.
	 * Skips SVG handling (queue only processes raster images).
	 */
	async handleBuffer(
		buffer: Buffer,
		options: ResizeOptions,
	): Promise<ManipulationJobResult> {
		this.logger.debug(`WebpImageManipulationJob.handleBuffer called`)
		return this.processRaster(buffer, options)
	}

	private async handleSvgFormat(
		filePathFrom: string,
		options: ResizeOptions,
	): Promise<ManipulationJobResult> {
		this.logger.debug(`SVG format requested. Source file: ${filePathFrom}`)
		const sourceExtension = extname(filePathFrom).toLowerCase()
		let isSourceSvg = sourceExtension === '.svg'

		this.logger.debug(`Source extension: ${sourceExtension}, isSourceSvg: ${isSourceSvg}`)

		if (!isSourceSvg) {
			try {
				const fileHandle = await fs.open(filePathFrom, 'r')
				try {
					const buffer = Buffer.alloc(512)
					const { bytesRead } = await fileHandle.read(buffer, 0, 512, 0)
					const content = buffer.toString('utf8', 0, bytesRead)
					isSourceSvg = content.trim().startsWith('<svg') || content.includes('xmlns="http://www.w3.org/2000/svg"')
					this.logger.debug(`Content-based SVG detection (header only): ${isSourceSvg}`)
				}
				finally {
					await fileHandle.close()
				}
			}
			catch (error: unknown) {
				isSourceSvg = false
				this.logger.debug(`Could not read file header: ${(error as Error).message}, assuming not SVG`)
			}
		}

		if (isSourceSvg) {
			const needsResizing = (options.width !== null && !Number.isNaN(options.width) && options.width > 0)
				|| (options.height !== null && !Number.isNaN(options.height) && options.height > 0)

			if (!needsResizing) {
				this.logger.debug(`SVG file needs no resizing, returning original`)
				const data = await fs.readFile(filePathFrom)
				const result = new ManipulationJobResult({
					size: String(data.length),
					format: 'svg',
					buffer: data,
				})
				this.logger.debug(`SVG copy result: ${JSON.stringify({ size: result.size, format: result.format })}`)
				return result
			}

			// SVG that needs resizing → convert to PNG
			const manipulation = sharp(filePathFrom)
			manipulation.png({ quality: options.quality })

			const resizeScales: { width?: number, height?: number } = {}
			if (options.width !== null && !Number.isNaN(options.width) && options.width > 0) {
				resizeScales.width = Number(options.width)
			}
			if (options.height !== null && !Number.isNaN(options.height) && options.height > 0) {
				resizeScales.height = Number(options.height)
			}

			if (Object.keys(resizeScales).length > 0) {
				manipulation.resize({
					...resizeScales,
					fit: options.fit,
					position: options.position,
					background: options.background,
				})
			}

			const { data, info } = await manipulation.toBuffer({ resolveWithObject: true })
			const result = new ManipulationJobResult({
				size: String(info.size),
				format: 'png',
				buffer: data,
			})
			this.logger.debug(`SVG resized to PNG. Result: ${JSON.stringify({ size: result.size, format: result.format })}`)
			return result
		}

		// Non-SVG source with SVG output requested → convert to PNG
		this.logger.debug('Non-SVG source with SVG output requested, converting to PNG')
		const manipulation = sharp(filePathFrom)
		manipulation.png({ quality: options.quality })

		const resizeScales: { width?: number, height?: number } = {}
		if (options.width !== null && !Number.isNaN(options.width) && options.width > 0) {
			resizeScales.width = Number(options.width)
		}
		if (options.height !== null && !Number.isNaN(options.height) && options.height > 0) {
			resizeScales.height = Number(options.height)
		}

		this.logger.debug(`Resize scales: ${JSON.stringify(resizeScales)}`)

		if (Object.keys(resizeScales).length > 0) {
			if (options.trimThreshold !== null && !Number.isNaN(options.trimThreshold)) {
				manipulation.trim({
					background: options.background,
					threshold: Number(options.trimThreshold),
				})
			}

			manipulation.resize({
				...resizeScales,
				fit: options.fit,
				position: options.position,
				background: options.background,
			})
		}

		const { data, info } = await manipulation.toBuffer({ resolveWithObject: true })
		this.logger.debug(`Manipulation complete. Result format: png, size: ${info.size}`)

		return new ManipulationJobResult({
			size: String(info.size),
			format: 'png',
			buffer: data,
		})
	}

	private async processRaster(
		input: string | Buffer,
		options: ResizeOptions,
	): Promise<ManipulationJobResult> {
		let manipulation = Buffer.isBuffer(input)
			? sharp(input, { limitInputPixels: 268402689, sequentialRead: true })
			: sharp(input)

		const resizeScales: { width?: number, height?: number } = {};

		(['width', 'height'] as const).forEach((scale: 'width' | 'height') => {
			const value = options[scale]
			if (value !== null && !Number.isNaN(value) && value > 0) {
				resizeScales[scale] = Number(value)
			}
		})

		// Pipeline order: trim → resize → format conversion
		if (Object.keys(resizeScales).length > 0) {
			if (options.trimThreshold !== null && !Number.isNaN(options.trimThreshold)) {
				manipulation = manipulation.trim({
					background: options.background,
					threshold: Number(options.trimThreshold),
				})
			}

			const resizeConfig = {
				...resizeScales,
				fit: options.fit,
				position: options.position,
				background: options.background,
			}

			this.logger.debug(`Applying Sharp resize with config:`, {
				resizeConfig: JSON.stringify(resizeConfig, null, 2),
			})

			manipulation = manipulation.resize(resizeConfig)
		}
		else {
			this.logger.debug(`Skipping resize - using original image dimensions (width: ${options.width}, height: ${options.height})`)
		}

		// Format conversion
		switch (options.format) {
			case 'jpeg':
				manipulation = manipulation.jpeg({
					quality: options.quality,
					progressive: true,
					mozjpeg: true,
					trellisQuantisation: true,
					overshootDeringing: true,
				})
				break
			case 'png':
				manipulation = manipulation.png({
					quality: options.quality,
					adaptiveFiltering: true,
					palette: options.quality < 95,
					compressionLevel: 6,
				})
				break
			case 'webp':
				manipulation = manipulation.webp({
					quality: options.quality,
					smartSubsample: true,
					effort: 4,
				})
				break
			case 'avif': {
				// Check pixel count to decide AVIF vs WebP fallback
				const metadata = Buffer.isBuffer(input)
					? await sharp(input, { limitInputPixels: 268402689, sequentialRead: true }).metadata()
					: await sharp(input).metadata()
				const totalPixels = (metadata.width || 0) * (metadata.height || 0)

				if (totalPixels > 2073600) {
					this.logger.warn(`Image too large for AVIF (${totalPixels}px), using WebP fallback`)
					manipulation = manipulation.webp({
						quality: options.quality,
						smartSubsample: true,
						effort: 4,
					})
					break
				}

				manipulation = manipulation.avif({
					quality: Math.min(options.quality, 60),
					effort: 2,
					chromaSubsampling: '4:2:0',
					lossless: false,
				})
				break
			}
			case 'gif':
				manipulation = manipulation.gif()
				break
			case 'tiff':
				manipulation = manipulation.tiff()
				break
			default:
				manipulation = manipulation.webp({
					quality: options.quality,
					smartSubsample: true,
					effort: 4,
				})
		}

		try {
			const { data, info } = await manipulation.toBuffer({ resolveWithObject: true })

			return new ManipulationJobResult({
				size: String(info.size),
				format: info.format,
				buffer: data,
			})
		}
		finally {
			try {
				manipulation.destroy()
			}
			catch {
				// Ignore destroy errors
			}
		}
	}
}
