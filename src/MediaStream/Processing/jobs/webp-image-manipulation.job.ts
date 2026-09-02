import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import { SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { AVIF_MAX_INPUT_PIXELS, SHARP_INPUT_PIXEL_LIMIT } from '#microservice/common/constants/image-limits.constant'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ManipulationJobResult from '../dto/manipulation-job-result.dto.js'

const SHARP_INPUT_OPTIONS = { limitInputPixels: SHARP_INPUT_PIXEL_LIMIT, sequentialRead: true }

/** AVIF quality above this buys nothing visible and multiplies encode time. */
const AVIF_MAX_QUALITY = 60
/** Below this quality PNG output is palette-quantised (much smaller for graphics). */
const PNG_PALETTE_BELOW_QUALITY = 95

const ENCODER_OPTIONS = {
	jpeg: { progressive: true, mozjpeg: true, trellisQuantisation: true, overshootDeringing: true },
	png: { adaptiveFiltering: true, compressionLevel: 6 },
	webp: { smartSubsample: true, effort: 4 },
	avif: { effort: 2, chromaSubsampling: '4:2:0', lossless: false },
} as const

/**
 * The format Sharp actually encodes for a requested format: SVG output is
 * rasterised to PNG, everything else is encoded as requested.
 */
export function outputFormat(format: SupportedResizeFormats): SupportedResizeFormats {
	return format === SupportedResizeFormats.svg ? SupportedResizeFormats.png : format
}

/**
 * Resizes and re-encodes one source file with Sharp.
 * Stateless service - all request data is passed via method parameters.
 */
@Injectable()
export default class WebpImageManipulationJob {
	async handle(filePathFrom: string, options: ResizeOptions): Promise<ManipulationJobResult> {
		CorrelatedLogger.debug(`WebpImageManipulationJob.handle called for ${filePathFrom} with options: ${JSON.stringify(options)}`, WebpImageManipulationJob.name)

		let format = outputFormat(options.format)
		if (format === SupportedResizeFormats.avif) {
			const metaPipeline = sharp(filePathFrom, SHARP_INPUT_OPTIONS)
			const metadata = await metaPipeline.metadata()
			metaPipeline.destroy()
			const totalPixels = (metadata.width || 0) * (metadata.height || 0)
			if (totalPixels > AVIF_MAX_INPUT_PIXELS) {
				CorrelatedLogger.warn(`Image too large for AVIF (${totalPixels}px), using WebP fallback`, WebpImageManipulationJob.name)
				format = SupportedResizeFormats.webp
			}
		}

		// autoOrient() applies any EXIF orientation tag and strips it so
		// downstream operations (trim/resize) work on pixels in display
		// orientation. Phone cameras commonly set orientation=6 (rotate
		// 90° CW); without this, portrait photos arrive rotated.
		let manipulation = sharp(filePathFrom, SHARP_INPUT_OPTIONS).autoOrient()

		const resizeScales: { width?: number, height?: number } = {}
		for (const scale of ['width', 'height'] as const) {
			const value = options[scale]
			if (value !== null && !Number.isNaN(value) && value > 0) {
				resizeScales[scale] = value
			}
		}

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

		const quality = options.quality
		switch (format) {
			case SupportedResizeFormats.jpeg:
				manipulation = manipulation.jpeg({ ...ENCODER_OPTIONS.jpeg, quality })
				break
			case SupportedResizeFormats.png:
				manipulation = manipulation.png({ ...ENCODER_OPTIONS.png, quality, palette: quality < PNG_PALETTE_BELOW_QUALITY })
				break
			case SupportedResizeFormats.avif:
				manipulation = manipulation.avif({ ...ENCODER_OPTIONS.avif, quality: Math.min(quality, AVIF_MAX_QUALITY) })
				break
			case SupportedResizeFormats.gif:
				manipulation = manipulation.gif()
				break
			case SupportedResizeFormats.tiff:
				manipulation = manipulation.tiff()
				break
			default:
				manipulation = manipulation.webp({ ...ENCODER_OPTIONS.webp, quality })
		}

		try {
			const { data, info } = await manipulation.toBuffer({ resolveWithObject: true })

			// Sharp/libvips reports AVIF output with format 'heif' (AVIF is a
			// HEIF-family container and shares the encoder). Normalise it back to
			// 'avif' so the stored metadata, weak ETag and resolved Content-Type
			// (image/avif) match the requested/actual output instead of falling
			// through to application/octet-stream. See lovell/sharp#2504.
			return new ManipulationJobResult({
				size: String(info.size),
				format: info.format === 'heif' ? SupportedResizeFormats.avif : info.format,
				buffer: data,
			})
		}
		finally {
			manipulation.destroy()
		}
	}
}
