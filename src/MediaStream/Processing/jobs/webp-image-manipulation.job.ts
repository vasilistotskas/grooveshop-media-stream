import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import { extname } from 'node:path'
import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ManipulationJobResult from '../dto/manipulation-job-result.dto.js'

/**
 * Handles image manipulation and format conversion using Sharp.
 * Stateless service - all request data is passed via method parameters.
 * Returns processed image as a Buffer (no intermediate disk I/O).
 */
@Injectable()
export default class WebpImageManipulationJob {
	/**
	 * Process an image from a file path.
	 * Supports SVG detection/handling and all raster formats.
	 */
	async handle(
		filePathFrom: string,
		options: ResizeOptions,
	): Promise<ManipulationJobResult> {
		CorrelatedLogger.debug(`WebpImageManipulationJob.handle called for ${filePathFrom} with options: ${JSON.stringify(options)}`, WebpImageManipulationJob.name)

		if (options.format === 'svg') {
			return this.handleSvgFormat(filePathFrom, options)
		}

		return this.processRaster(filePathFrom, options)
	}

	private async handleSvgFormat(
		filePathFrom: string,
		options: ResizeOptions,
	): Promise<ManipulationJobResult> {
		CorrelatedLogger.debug(`SVG format requested. Source file: ${filePathFrom}`, WebpImageManipulationJob.name)
		const sourceExtension = extname(filePathFrom).toLowerCase()
		let isSourceSvg = sourceExtension === '.svg'

		CorrelatedLogger.debug(`Source extension: ${sourceExtension}, isSourceSvg: ${isSourceSvg}`, WebpImageManipulationJob.name)

		if (!isSourceSvg) {
			try {
				const fileHandle = await fs.open(filePathFrom, 'r')
				try {
					const buffer = Buffer.alloc(512)
					const { bytesRead } = await fileHandle.read(buffer, 0, 512, 0)
					const content = buffer.toString('utf8', 0, bytesRead)
					isSourceSvg = content.trim().startsWith('<svg') || content.includes('xmlns="http://www.w3.org/2000/svg"')
					CorrelatedLogger.debug(`Content-based SVG detection (header only): ${isSourceSvg}`, WebpImageManipulationJob.name)
				}
				finally {
					await fileHandle.close()
				}
			}
			catch (error: unknown) {
				isSourceSvg = false
				CorrelatedLogger.debug(`Could not read file header: ${(error as Error).message}, assuming not SVG`, WebpImageManipulationJob.name)
			}
		}

		if (isSourceSvg) {
			const needsResizing = (options.width !== null && !Number.isNaN(options.width) && options.width > 0)
				|| (options.height !== null && !Number.isNaN(options.height) && options.height > 0)

			if (!needsResizing) {
				CorrelatedLogger.debug(`SVG file needs no resizing, returning original`, WebpImageManipulationJob.name)
				const data = await fs.readFile(filePathFrom)
				const result = new ManipulationJobResult({
					size: String(data.length),
					format: 'svg',
					buffer: data,
				})
				CorrelatedLogger.debug(`SVG copy result: ${JSON.stringify({ size: result.size, format: result.format })}`, WebpImageManipulationJob.name)
				return result
			}

			// SVG that needs resizing → resize first, then convert to PNG
			const manipulation = sharp(filePathFrom, { limitInputPixels: 268402689 })

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

			// Format conversion last
			manipulation.png({ quality: options.quality })

			const { data, info } = await manipulation.toBuffer({ resolveWithObject: true })
			const result = new ManipulationJobResult({
				size: String(info.size),
				format: 'png',
				buffer: data,
			})
			CorrelatedLogger.debug(`SVG resized to PNG. Result: ${JSON.stringify({ size: result.size, format: result.format })}`, WebpImageManipulationJob.name)
			return result
		}

		// Non-SVG source with SVG output requested → convert to PNG
		CorrelatedLogger.debug('Non-SVG source with SVG output requested, converting to PNG', WebpImageManipulationJob.name)
		const manipulation = sharp(filePathFrom, { limitInputPixels: 268402689 })

		const resizeScales: { width?: number, height?: number } = {}
		if (options.width !== null && !Number.isNaN(options.width) && options.width > 0) {
			resizeScales.width = Number(options.width)
		}
		if (options.height !== null && !Number.isNaN(options.height) && options.height > 0) {
			resizeScales.height = Number(options.height)
		}

		CorrelatedLogger.debug(`Resize scales: ${JSON.stringify(resizeScales)}`, WebpImageManipulationJob.name)

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

		// Format conversion last
		manipulation.png({ quality: options.quality })

		const { data, info } = await manipulation.toBuffer({ resolveWithObject: true })
		CorrelatedLogger.debug(`Manipulation complete. Result format: png, size: ${info.size}`, WebpImageManipulationJob.name)

		return new ManipulationJobResult({
			size: String(info.size),
			format: 'png',
			buffer: data,
		})
	}

	private async processRaster(
		input: string,
		options: ResizeOptions,
	): Promise<ManipulationJobResult> {
		const sharpOptions = { limitInputPixels: 268402689, sequentialRead: true }

		// For AVIF, get metadata upfront to decide fallback before building the pipeline
		let avifFallbackToWebp = false
		if (options.format === 'avif') {
			const metaPipeline = sharp(input, sharpOptions)
			const metadata = await metaPipeline.metadata()
			metaPipeline.destroy()
			const totalPixels = (metadata.width || 0) * (metadata.height || 0)
			if (totalPixels > 2073600) {
				CorrelatedLogger.warn(`Image too large for AVIF (${totalPixels}px), using WebP fallback`, WebpImageManipulationJob.name)
				avifFallbackToWebp = true
			}
		}

		// autoOrient() applies any EXIF orientation tag and strips it so
		// downstream operations (trim/resize) work on pixels in display
		// orientation. Phone cameras commonly set orientation=6 (rotate
		// 90° CW); without this, portrait photos arrive rotated.
		let manipulation = sharp(input, sharpOptions).autoOrient()

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

			CorrelatedLogger.debug(`Applying Sharp resize with config: ${JSON.stringify(resizeConfig)}`, WebpImageManipulationJob.name)

			manipulation = manipulation.resize(resizeConfig)
		}
		else {
			CorrelatedLogger.debug(`Skipping resize - using original image dimensions (width: ${options.width}, height: ${options.height})`, WebpImageManipulationJob.name)
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
				if (avifFallbackToWebp) {
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

			// Sharp/libvips reports AVIF output with format 'heif' (AVIF is a
			// HEIF-family container and shares the encoder). Normalise it back to
			// 'avif' so the stored metadata, weak ETag and resolved Content-Type
			// (image/avif) match the requested/actual output instead of falling
			// through to application/octet-stream. See lovell/sharp#2504.
			const outputFormat = info.format === 'heif' ? 'avif' : info.format

			return new ManipulationJobResult({
				size: String(info.size),
				format: outputFormat,
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
