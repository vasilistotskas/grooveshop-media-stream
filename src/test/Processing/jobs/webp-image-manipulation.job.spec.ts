import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BackgroundOptions, FitOptions, PositionOptions, ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { TRIM_WORKING_SIZE } from '#microservice/common/constants/image-limits.constant'
import { ProcessingTimeoutError } from '#microservice/common/errors/media-stream.errors'
import ManipulationJobResult from '#microservice/Processing/dto/manipulation-job-result.dto'
import WebpImageManipulationJob, { outputFormat } from '#microservice/Processing/jobs/webp-image-manipulation.job'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

vi.mock('sharp', () => ({
	default: vi.fn(),
}))

const SHARP_INPUT_OPTIONS = { limitInputPixels: 268402689, sequentialRead: true }
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 }
/** What the shrink-on-load working copy resolves to (raw pixels + geometry). */
const WORKING_COPY = { data: Buffer.from('raw-working-copy'), info: { width: 1024, height: 768, channels: 3, size: 1024 * 768 * 3, format: 'raw' } }

describe('webpImageManipulationJob', () => {
	let job: WebpImageManipulationJob
	const testBuffer = Buffer.from('test-image-data')
	const mockManipulation = {
		webp: vi.fn().mockReturnThis(),
		jpeg: vi.fn().mockReturnThis(),
		png: vi.fn().mockReturnThis(),
		gif: vi.fn().mockReturnThis(),
		tiff: vi.fn().mockReturnThis(),
		avif: vi.fn().mockReturnThis(),
		resize: vi.fn().mockReturnThis(),
		trim: vi.fn().mockReturnThis(),
		raw: vi.fn().mockReturnThis(),
		timeout: vi.fn().mockReturnThis(),
		autoOrient: vi.fn().mockReturnThis(),
		toBuffer: vi.fn(),
		destroy: vi.fn(),
	}

	/** The working-copy pass resolves first (raw), the encode pass second. */
	function primeTrimmedRun(finalInfo: Record<string, unknown> = { size: 1000, format: 'webp' }): void {
		mockManipulation.toBuffer
			.mockResolvedValueOnce(WORKING_COPY)
			.mockResolvedValueOnce({ data: testBuffer, info: finalInfo })
	}

	function options(overrides: Partial<ResizeOptions> = {}): ResizeOptions {
		return new ResizeOptions({
			width: 800,
			height: 600,
			fit: FitOptions.contain,
			position: PositionOptions.entropy,
			background: BackgroundOptions.transparent,
			trimThreshold: 5,
			format: SupportedResizeFormats.webp,
			quality: 80,
			...overrides,
		})
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockManipulation.toBuffer.mockResolvedValue({ data: testBuffer, info: { size: 1000, format: 'webp' } })
		;(sharp as any).mockReturnValue(mockManipulation)
		job = new WebpImageManipulationJob(createConfigServiceMock({ 'processing.timeoutSeconds': 20 }))
	})

	describe('handle', () => {
		it('should handle webp format with quality', async () => {
			primeTrimmedRun()

			const result = await job.handle('test.webp', options())

			expect(sharp).toHaveBeenNthCalledWith(1, 'test.webp', SHARP_INPUT_OPTIONS)
			expect(mockManipulation.resize).toHaveBeenLastCalledWith({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: TRANSPARENT,
			})
			expect(mockManipulation.webp).toHaveBeenCalledWith({ quality: 80, smartSubsample: true, effort: 4 })
			expect(mockManipulation.toBuffer).toHaveBeenLastCalledWith({ resolveWithObject: true })
			expect(result).toBeInstanceOf(ManipulationJobResult)
			expect(result.size).toBe('1000')
			expect(result.buffer).toBe(testBuffer)
		})

		it('should handle jpeg format with quality', async () => {
			primeTrimmedRun({ size: 1000, format: 'jpeg' })

			const result = await job.handle('test.jpeg', options({ format: SupportedResizeFormats.jpeg }))

			expect(mockManipulation.jpeg).toHaveBeenCalledWith({
				quality: 80,
				progressive: true,
				mozjpeg: true,
				trellisQuantisation: true,
				overshootDeringing: true,
			})
			expect(result.size).toBe('1000')
			expect(result.buffer).toBe(testBuffer)
		})

		it('should handle png format with quality', async () => {
			primeTrimmedRun({ size: 1000, format: 'png' })

			const result = await job.handle('test.png', options({ format: SupportedResizeFormats.png }))

			expect(mockManipulation.png).toHaveBeenCalledWith({
				quality: 80,
				adaptiveFiltering: true,
				palette: true,
				compressionLevel: 6,
			})
			expect(result.format).toBe('png')
		})

		it('should handle gif format', async () => {
			primeTrimmedRun({ size: 1000, format: 'gif' })

			const result = await job.handle('test.gif', options({ format: SupportedResizeFormats.gif }))

			expect(mockManipulation.gif).toHaveBeenCalled()
			expect(result.format).toBe('gif')
		})

		it('should handle tiff format', async () => {
			primeTrimmedRun({ size: 1000, format: 'tiff' })

			const result = await job.handle('test.tiff', options({ format: SupportedResizeFormats.tiff }))

			expect(mockManipulation.tiff).toHaveBeenCalled()
			expect(result.format).toBe('tiff')
		})

		it('should handle avif format with optimized encoding settings', async () => {
			// Sharp/libvips reports AVIF output as 'heif' — mirror that here so the
			// test exercises the heif→avif normalisation (see lovell/sharp#2504).
			primeTrimmedRun({ size: 1000, format: 'heif' })

			const result = await job.handle('test.avif', options({ format: SupportedResizeFormats.avif }))

			expect(mockManipulation.avif).toHaveBeenCalledWith({
				quality: 60,
				effort: 2,
				chromaSubsampling: '4:2:0',
				lossless: false,
			})
			// The job must normalise Sharp's 'heif' back to 'avif' so the
			// downstream Content-Type resolves to image/avif, not octet-stream.
			expect(result.format).toBe('avif')
		})

		it('encodes AVIF for any source size: the decode cost is the trim, not the encoder', async () => {
			mockManipulation.toBuffer.mockResolvedValue({ data: testBuffer, info: { size: 1000, format: 'heif' } })

			const result = await job.handle('huge-12mp.jpg', options({ format: SupportedResizeFormats.avif, trimThreshold: 0 }))

			expect(mockManipulation.avif).toHaveBeenCalled()
			expect(mockManipulation.webp).not.toHaveBeenCalled()
			expect(result.format).toBe('avif')
		})

		describe('trim', () => {
			it('runs on a shrink-on-load working copy instead of the full-resolution source', async () => {
				primeTrimmedRun()

				await job.handle('test.webp', options({ trimThreshold: 10 }))

				// Pass 1: the source pipeline is shrunk (inside, never enlarged) to raw pixels...
				expect(mockManipulation.resize).toHaveBeenNthCalledWith(1, { width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
				expect(mockManipulation.raw).toHaveBeenCalledTimes(1)
				expect(mockManipulation.toBuffer).toHaveBeenNthCalledWith(1, { resolveWithObject: true })
				// ...pass 2: a second pipeline over those pixels trims, then resizes to the target.
				expect(sharp).toHaveBeenNthCalledWith(2, WORKING_COPY.data, { raw: { width: 1024, height: 768, channels: 3 } })
				expect(mockManipulation.trim).toHaveBeenCalledWith({ background: TRANSPARENT, threshold: 10 })
				expect(mockManipulation.resize).toHaveBeenNthCalledWith(2, expect.objectContaining({ width: 800, height: 600 }))
				expect(mockManipulation.trim).toHaveBeenCalledTimes(1)
				// Both pipelines are released.
				expect(mockManipulation.destroy).toHaveBeenCalledTimes(2)
			})

			it('keeps the working copy at least TRIM_WORKING_SIZE and at least twice the target', async () => {
				primeTrimmedRun()
				await job.handle('a.jpg', options({ width: 100, height: 100 }))
				expect(mockManipulation.resize).toHaveBeenNthCalledWith(1, expect.objectContaining({ width: TRIM_WORKING_SIZE, height: TRIM_WORKING_SIZE }))

				vi.clearAllMocks()
				;(sharp as any).mockReturnValue(mockManipulation)
				primeTrimmedRun()
				await job.handle('a.jpg', options({ width: 1536, height: 1536 }))
				expect(mockManipulation.resize).toHaveBeenNthCalledWith(1, expect.objectContaining({ width: 3072, height: 3072 }))
			})

			it('is skipped entirely (one pipeline, shrink-on-load intact) when the threshold is unset', async () => {
				await job.handle('test.webp', options({ trimThreshold: 0 }))

				expect(sharp).toHaveBeenCalledTimes(1)
				expect(mockManipulation.trim).not.toHaveBeenCalled()
				expect(mockManipulation.raw).not.toHaveBeenCalled()
				expect(mockManipulation.resize).toHaveBeenCalledTimes(1)
				expect(mockManipulation.destroy).toHaveBeenCalledTimes(1)
			})

			it('is skipped when no resize is requested', async () => {
				await job.handle('test.webp', options({ width: 0, height: 0 }))

				expect(mockManipulation.trim).not.toHaveBeenCalled()
				expect(mockManipulation.resize).not.toHaveBeenCalled()
			})
		})

		describe('timeout', () => {
			it('applies processing.timeoutSeconds to every pipeline', async () => {
				primeTrimmedRun()

				await job.handle('test.webp', options())

				expect(mockManipulation.timeout).toHaveBeenCalledTimes(2)
				expect(mockManipulation.timeout).toHaveBeenCalledWith({ seconds: 20 })
			})

			it('does not set a timeout when configured to 0', async () => {
				job = new WebpImageManipulationJob(createConfigServiceMock({ 'processing.timeoutSeconds': 0 }))

				await job.handle('test.webp', options({ trimThreshold: 0 }))

				expect(mockManipulation.timeout).not.toHaveBeenCalled()
			})

			it('translates Sharp\'s timeout failure into ProcessingTimeoutError and leaves other errors alone', async () => {
				mockManipulation.toBuffer.mockRejectedValueOnce(new Error('timeout: 20s exceeded'))
				await expect(job.handle('slow.jpg', options({ trimThreshold: 0 }))).rejects.toBeInstanceOf(ProcessingTimeoutError)

				mockManipulation.toBuffer.mockRejectedValueOnce(new Error('Input file contains unsupported image format'))
				await expect(job.handle('bad.jpg', options({ trimThreshold: 0 }))).rejects.toThrow('unsupported image format')
			})
		})

		describe('svg output requests', () => {
			const svgOptions = options({ format: SupportedResizeFormats.svg })

			it('rasterises to PNG through the same trim/autoOrient/resize pipeline as every raster', async () => {
				primeTrimmedRun({ size: 1000, format: 'png' })

				const result = await job.handle('test.svg', svgOptions)

				expect(sharp).toHaveBeenNthCalledWith(1, 'test.svg', SHARP_INPUT_OPTIONS)
				expect(mockManipulation.autoOrient).toHaveBeenCalledTimes(1)
				expect(mockManipulation.trim).toHaveBeenCalledWith({ background: TRANSPARENT, threshold: 5 })
				expect(mockManipulation.resize).toHaveBeenLastCalledWith(expect.objectContaining({ width: 800, height: 600 }))
				expect(mockManipulation.png).toHaveBeenCalledWith({ quality: 80, adaptiveFiltering: true, palette: true, compressionLevel: 6 })
				expect(result.format).toBe('png')
			})

			it('does not sniff the source: a non-SVG source with SVG output requested takes the same pipeline', async () => {
				mockManipulation.toBuffer.mockResolvedValue({ data: testBuffer, info: { size: 1000, format: 'png' } })

				const result = await job.handle('test-does-not-exist-on-disk.jpg', options({ format: SupportedResizeFormats.svg, trimThreshold: 0 }))

				expect(sharp).toHaveBeenCalledTimes(1)
				expect(mockManipulation.png).toHaveBeenCalledWith({ quality: 80, adaptiveFiltering: true, palette: true, compressionLevel: 6 })
				expect(mockManipulation.destroy).toHaveBeenCalledTimes(1)
				expect(result.format).toBe('png')
			})
		})

		it('should handle default format when not specified', async () => {
			primeTrimmedRun()

			const result = await job.handle('test.webp', options({ format: undefined }))

			expect(mockManipulation.webp).toHaveBeenCalledWith({ quality: 80, smartSubsample: true, effort: 4 })
			expect(result.size).toBe('1000')
		})
	})

	describe('outputFormat', () => {
		it('maps svg to png and passes every other format through', () => {
			expect(outputFormat(SupportedResizeFormats.svg)).toBe(SupportedResizeFormats.png)
			for (const format of [
				SupportedResizeFormats.webp,
				SupportedResizeFormats.jpeg,
				SupportedResizeFormats.png,
				SupportedResizeFormats.gif,
				SupportedResizeFormats.tiff,
				SupportedResizeFormats.avif,
			]) {
				expect(outputFormat(format)).toBe(format)
			}
		})
	})
})
