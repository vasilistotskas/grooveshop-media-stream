import type { OutputInfo, Sharp } from 'sharp'
import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { Buffer } from 'node:buffer'
import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import { FitOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { AVIF_CHROMA_SUBSAMPLING, AVIF_EFFORT, AVIF_MAX_QUALITY, SHARPEN_MIN_DOWNSCALE_FACTOR, SHARPEN_SIGMA } from '#microservice/common/constants/image-encoding.constant'
import { SHARP_INPUT_PIXEL_LIMIT, TRIM_WORKING_SIZE } from '#microservice/common/constants/image-limits.constant'
import { ProcessingTimeoutError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ManipulationJobResult from '../dto/manipulation-job-result.dto.js'

const SHARP_INPUT_OPTIONS = { limitInputPixels: SHARP_INPUT_PIXEL_LIMIT, sequentialRead: true }

/** Below this quality PNG output is palette-quantised (much smaller for graphics). */
const PNG_PALETTE_BELOW_QUALITY = 95

const ENCODER_OPTIONS = {
	jpeg: { progressive: true, mozjpeg: true, trellisQuantisation: true, overshootDeringing: true },
	png: { adaptiveFiltering: true, compressionLevel: 6 },
	webp: { smartSubsample: true, effort: 4 },
	avif: { effort: AVIF_EFFORT, chromaSubsampling: AVIF_CHROMA_SUBSAMPLING, lossless: false },
} as const

/**
 * The format Sharp actually encodes for a requested format: SVG output is
 * rasterised to PNG, everything else is encoded as requested.
 */
export function outputFormat(format: SupportedResizeFormats): SupportedResizeFormats {
	return format === SupportedResizeFormats.svg ? SupportedResizeFormats.png : format
}

/**
 * How many times smaller the output is than the source along the axis Sharp
 * scales by: `cover`/`outside`/`fill` follow the smaller reduction ratio,
 * `contain`/`inside` the larger. 1 or less means no reduction.
 */
function downscaleFactor(source: { width: number, height: number }, target: { width?: number, height?: number }, fit: FitOptions): number {
	const ratios = [
		target.width ? source.width / target.width : undefined,
		target.height ? source.height / target.height : undefined,
	].filter((ratio): ratio is number => ratio !== undefined)
	return fit === FitOptions.contain || fit === FitOptions.inside ? Math.max(...ratios) : Math.min(...ratios)
}

/**
 * The box to hand Sharp so the output never exceeds the source yet keeps the
 * requested aspect ratio (imgix `fit=min`). Sharp's own `withoutEnlargement`
 * returns the source at its own size and aspect whenever it would have to
 * enlarge, which changes the shape of a layout box that was sized from the
 * request.
 *
 * - `cover`/`fill`: scale the request down uniformly until it fits inside the
 *   source on both axes, then crop (cover) or stretch (fill) to that box. Fill
 *   cannot keep both aspect and every source pixel without enlarging an axis.
 * - `contain`: the smallest box of the requested aspect that holds the source
 *   at 1:1, so the image is padded but never downscaled to make room for
 *   padding bytes the target box would otherwise carry.
 * - `outside`/`inside`: the output aspect is the source's by definition, so
 *   there is no requested aspect to keep; `withoutEnlargement` is enough.
 * - A single requested axis: the other axis follows the source aspect, so
 *   `withoutEnlargement` is enough as well.
 *
 * The limiting axis is set to the source size exactly and the other derived
 * from it, so rounding can never push the box past the source.
 */
function boxWithinSource(source: { width: number, height: number }, target: { width?: number, height?: number }, fit: FitOptions): { width?: number, height?: number } {
	const { width, height } = target
	if (!width || !height) {
		return target
	}
	const widthRatio = source.width / width
	const heightRatio = source.height / height
	if (fit === FitOptions.cover || fit === FitOptions.fill) {
		if (Math.min(widthRatio, heightRatio) >= 1) {
			return target
		}
		return widthRatio <= heightRatio
			? { width: source.width, height: Math.min(source.height, Math.max(1, Math.round(height * widthRatio))) }
			: { width: Math.min(source.width, Math.max(1, Math.round(width * heightRatio))), height: source.height }
	}
	if (fit === FitOptions.contain) {
		if (Math.max(widthRatio, heightRatio) >= 1) {
			return target
		}
		return widthRatio >= heightRatio
			? { width: source.width, height: Math.ceil(height * widthRatio) }
			: { width: Math.ceil(width * heightRatio), height: source.height }
	}
	return target
}

/**
 * Resizes and re-encodes one source file with Sharp.
 * Stateless service - all request data is passed via method parameters.
 */
@Injectable()
export default class WebpImageManipulationJob {
	private readonly timeoutSeconds: number

	constructor(configService: ConfigService) {
		this.timeoutSeconds = Math.max(0, configService.get<number>('processing.timeoutSeconds'))
	}

	async handle(filePathFrom: string, options: ResizeOptions): Promise<ManipulationJobResult> {
		CorrelatedLogger.debug(`WebpImageManipulationJob.handle called for ${filePathFrom} with options: ${JSON.stringify(options)}`, WebpImageManipulationJob.name)

		const format = outputFormat(options.format)

		// autoOrient() applies any EXIF orientation tag and strips it so
		// downstream operations (trim/resize) work on pixels in display
		// orientation. Phone cameras commonly set orientation=6 (rotate
		// 90° CW); without this, portrait photos arrive rotated.
		let manipulation = this.withTimeout(sharp(filePathFrom, SHARP_INPUT_OPTIONS).autoOrient())

		const resizeScales: { width?: number, height?: number } = {}
		for (const scale of ['width', 'height'] as const) {
			const value = options[scale]
			if (value !== null && !Number.isNaN(value) && value > 0) {
				resizeScales[scale] = value
			}
		}

		try {
			// Pipeline order: trim → resize → format conversion
			if (Object.keys(resizeScales).length > 0) {
				const source = await this.sourceSize(manipulation)
				const box = source ? boxWithinSource(source, resizeScales, options.fit) : resizeScales
				const factor = source ? downscaleFactor(source, box, options.fit) : 1
				if (options.trimThreshold !== null && !Number.isNaN(options.trimThreshold)) {
					manipulation = await this.trimOnWorkingCopy(manipulation, options, resizeScales)
				}

				const resizeConfig = {
					...box,
					fit: options.fit,
					position: options.position,
					background: options.background,
					withoutEnlargement: true,
				}
				CorrelatedLogger.debug(`Applying Sharp resize with config: ${JSON.stringify(resizeConfig)}`, WebpImageManipulationJob.name)
				manipulation = manipulation.resize(resizeConfig)
				if (factor > SHARPEN_MIN_DOWNSCALE_FACTOR) {
					manipulation = manipulation.sharpen({ sigma: SHARPEN_SIGMA })
				}
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

			const { data, info } = await this.toBuffer(manipulation, filePathFrom)

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

	/**
	 * Sharp applies trim before resize whatever the call order, and switches
	 * shrink-on-load off whenever a trim is present (lovell/sharp#888), so a
	 * trimmed request decodes the source at full resolution: 540 ms instead
	 * of 25 ms for a 4000×3000 JPEG. Shrink first on its own pipeline, then
	 * trim the small working copy; the crop scales with the image. The copy
	 * covers (`fit: outside`) at least twice the target on every requested
	 * axis, never enlarged, so the final resize cannot upscale trimmed
	 * content even for `cover` on a very wide or very tall source.
	 */
	private async trimOnWorkingCopy(source: Sharp, options: ResizeOptions, target: { width?: number, height?: number }): Promise<Sharp> {
		const box = {
			width: target.width ? Math.max(TRIM_WORKING_SIZE, 2 * target.width) : undefined,
			height: target.height ? Math.max(TRIM_WORKING_SIZE, 2 * target.height) : undefined,
		}
		const { data, info } = await this.toBuffer(
			source.resize({ ...box, fit: 'outside', withoutEnlargement: true }).raw(),
			'trim working copy',
		)
		source.destroy()

		return this.withTimeout(sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } }))
			.trim({ background: options.background, threshold: Number(options.trimThreshold) })
	}

	/**
	 * Reads the source header (no pixel decode) for its displayed size. The
	 * header reports the stored orientation, so a 90° EXIF rotation swaps the
	 * axes the same way `autoOrient()` does. Undefined when the header has no
	 * dimensions.
	 */
	private async sourceSize(source: Sharp): Promise<{ width: number, height: number } | undefined> {
		const { width, height, orientation } = await source.metadata()
		if (!width || !height) {
			return undefined
		}
		const rotated = orientation !== undefined && orientation >= 5
		return rotated ? { width: height, height: width } : { width, height }
	}

	private withTimeout(pipeline: Sharp): Sharp {
		return this.timeoutSeconds > 0 ? pipeline.timeout({ seconds: this.timeoutSeconds }) : pipeline
	}

	/**
	 * Sharp reports an exceeded `timeout()` only through the error message
	 * (its documented detection is `err.message.includes('timeout')`), so
	 * this is the one place that string is translated into a typed error.
	 */
	private async toBuffer(pipeline: Sharp, source: string): Promise<{ data: Buffer, info: OutputInfo }> {
		try {
			return await pipeline.toBuffer({ resolveWithObject: true })
		}
		catch (error: unknown) {
			if (this.timeoutSeconds > 0 && errorMessage(error).toLowerCase().includes('timeout')) {
				CorrelatedLogger.warn(`Sharp pipeline exceeded ${this.timeoutSeconds}s for ${source}`, WebpImageManipulationJob.name)
				throw new ProcessingTimeoutError({ source, timeoutSeconds: this.timeoutSeconds })
			}
			throw error
		}
	}
}
