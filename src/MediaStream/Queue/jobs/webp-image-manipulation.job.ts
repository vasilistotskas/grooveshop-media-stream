import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { copyFile, readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'
import ManipulationJobResult from '../dto/manipulation-job-result.dto.js'

/**
 * Handles image manipulation and format conversion using Sharp.
 * Stateless service - all request data is passed via method parameters.
 */
@Injectable()
export default class WebpImageManipulationJob {
	private readonly logger = new Logger(WebpImageManipulationJob.name)
	async handle(
		filePathFrom: string,
		filePathTo: string,
		options: ResizeOptions,
	): Promise<ManipulationJobResult> {
		this.logger.debug(`WebpImageManipulationJob.handle called with all options:`, {
			filePathFrom,
			filePathTo,
			options: JSON.stringify(options, null, 2),
		})

		if (options.format === 'svg') {
			this.logger.debug(`SVG format requested. Source file: ${filePathFrom}`)
			const sourceExtension = extname(filePathFrom).toLowerCase()
			let isSourceSvg = sourceExtension === '.svg'

			this.logger.debug(`Source extension: ${sourceExtension}, isSourceSvg: ${isSourceSvg}`)

			if (!isSourceSvg) {
				try {
					const fileContent = await readFile(filePathFrom, 'utf8')
					isSourceSvg = fileContent.trim().startsWith('<svg') || fileContent.includes('xmlns="http://www.w3.org/2000/svg"')
					this.logger.debug(`Content-based SVG detection: ${isSourceSvg}`)
				}
				catch {
					isSourceSvg = false
					this.logger.debug('Could not read file as text, assuming not SVG')
				}
			}

			if (isSourceSvg) {
				// Only resize if dimensions are positive (> 0)
				// 0 means "use original dimensions"
				const needsResizing = (options.width !== null && !Number.isNaN(options.width) && options.width > 0)
					|| (options.height !== null && !Number.isNaN(options.height) && options.height > 0)

				if (!needsResizing) {
					this.logger.debug(`SVG file needs no resizing, copying original`)
					await copyFile(filePathFrom, filePathTo)
					const stats = await readFile(filePathFrom)
					const result = new ManipulationJobResult({
						size: String(stats.length),
						format: 'svg',
					})
					this.logger.debug(`SVG copy result: ${JSON.stringify(result)}`)
					return result
				}
				else {
					const manipulation = sharp(filePathFrom)
					manipulation.png({ quality: options.quality })

					const resizeScales: { width?: number, height?: number } = {}

					// Only add dimensions if they are positive (> 0)
					if (options.width !== null && !Number.isNaN(options.width) && options.width > 0) {
						resizeScales.width = Number(options.width)
					}
					if (options.height !== null && !Number.isNaN(options.height) && options.height > 0) {
						resizeScales.height = Number(options.height)
					}

					// Only resize if we have valid dimensions
					if (Object.keys(resizeScales).length > 0) {
						manipulation.resize({
							...resizeScales,
							fit: options.fit,
							position: options.position,
							background: options.background,
						})
					}

					const manipulatedFile = await manipulation.toFile(filePathTo)
					const result = new ManipulationJobResult({
						size: String(manipulatedFile.size),
						format: 'png',
					})
					this.logger.debug(`SVG resized to PNG. Result: ${JSON.stringify(result)}`)
					return result
				}
			}
			else {
				this.logger.debug('Non-SVG source with SVG output requested, converting to PNG')

				const manipulation = sharp(filePathFrom)
				manipulation.png({ quality: options.quality })

				const resizeScales: { width?: number, height?: number } = {}
				// Only add dimensions if they are positive (> 0)
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

				const manipulatedFile = await manipulation.toFile(filePathTo)
				this.logger.debug(`Manipulation complete. Result format: png, size: ${manipulatedFile.size}`)

				return new ManipulationJobResult({
					size: String(manipulatedFile.size),
					format: 'png',
				})
			}
		}

		const manipulation = sharp(filePathFrom)

		switch (options.format) {
			case 'jpeg':
				manipulation.jpeg({ quality: options.quality })
				break
			case 'png':
				manipulation.png({ quality: options.quality })
				break
			case 'webp':
				manipulation.webp({ quality: options.quality })
				break
			case 'avif':
				// AVIF quality is capped at 75 because:
				// 1. Diminishing returns: quality above 75 provides minimal visual improvement
				// 2. Encoding speed: higher quality significantly increases encoding time (exponential)
				// 3. File size: quality 75 provides excellent compression with near-lossless appearance
				// 4. Browser compatibility: some decoders struggle with very high quality AVIF
				manipulation.avif({ quality: Math.min(options.quality, 75), chromaSubsampling: '4:2:0' })
				break
			case 'gif':
				manipulation.gif()
				break
			case 'tiff':
				manipulation.tiff()
				break
			default:
				manipulation.webp({ quality: options.quality })
		}

		const resizeScales: { width?: number, height?: number } = {};

		// Only add dimensions if they are positive (> 0)
		// 0 means "use original dimensions" - skip resizing
		(['width', 'height'] as const).forEach((scale: 'width' | 'height') => {
			const value = options[scale]
			if (value !== null && !Number.isNaN(value) && value > 0) {
				resizeScales[scale] = Number(value)
			}
		})

		if (Object.keys(resizeScales).length > 0) {
			if (options.trimThreshold !== null && !Number.isNaN(options.trimThreshold)) {
				manipulation.trim({
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

			manipulation.resize(resizeConfig)
		}
		else {
			this.logger.debug(`Skipping resize - using original image dimensions (width: ${options.width}, height: ${options.height})`)
		}

		const manipulatedFile = await manipulation.toFile(filePathTo)

		return new ManipulationJobResult({
			size: String(manipulatedFile.size),
			format: manipulatedFile.format,
		})
	}
}
