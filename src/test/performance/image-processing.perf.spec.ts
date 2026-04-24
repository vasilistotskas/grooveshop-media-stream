import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import WebpImageManipulationJob from '#microservice/Queue/jobs/webp-image-manipulation.job'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * Performance tests for the image processing pipeline.
 * These tests use real Sharp processing (not mocked) to measure actual throughput.
 *
 * Run with: npx vitest run src/test/performance/
 */

const DEFAULT_IMAGE_PATH = join(cwd(), 'public', 'default.png')

// Test images generated once and reused
let smallImage: Buffer // 200x200
let mediumImage: Buffer // 1024x768
let largeImage: Buffer // 4096x3072
let xlImage: Buffer // 8192x4320 (max supported)

beforeAll(async () => {
	// Re-enable Sharp cache and concurrency for realistic benchmarks
	sharp.cache(true)
	sharp.concurrency(0) // 0 = auto (CPU cores - 1)

	// Generate test images of various sizes from noise
	smallImage = await sharp({
		create: { width: 200, height: 200, channels: 3, background: { r: 128, g: 64, b: 32 } },
	}).png().toBuffer()

	mediumImage = await sharp({
		create: { width: 1024, height: 768, channels: 3, background: { r: 64, g: 128, b: 200 } },
	}).png().toBuffer()

	largeImage = await sharp({
		create: { width: 4096, height: 3072, channels: 3, background: { r: 200, g: 100, b: 50 } },
	}).png().toBuffer()

	xlImage = await sharp({
		create: { width: 8192, height: 4320, channels: 3, background: { r: 100, g: 200, b: 150 } },
	}).png().toBuffer()
})

afterAll(() => {
	// Restore test defaults
	sharp.cache(false)
	sharp.concurrency(1)
})

function makeResizeOptions(overrides: Partial<ResizeOptions> = {}): ResizeOptions {
	return new ResizeOptions({
		width: 800,
		height: 600,
		fit: 'contain',
		position: 'entropy',
		background: 'transparent',
		trimThreshold: 0,
		format: SupportedResizeFormats.webp,
		quality: 80,
		...overrides,
	})
}

async function measureMs(fn: () => Promise<unknown>): Promise<number> {
	const start = performance.now()
	await fn()
	return performance.now() - start
}

describe('image Processing Performance', () => {
	describe('sharp Pipeline Throughput', () => {
		it('should resize small image (200×200 → 100×100 WebP) under 50ms', async () => {
			const ms = await measureMs(async () => {
				await sharp(smallImage)
					.resize(100, 100, { fit: 'contain' })
					.webp({ quality: 80 })
					.toBuffer()
			})

			expect(ms).toBeLessThan(50)
		})

		it('should resize medium image (1024×768 → 400×300 WebP) under 100ms', async () => {
			const ms = await measureMs(async () => {
				await sharp(mediumImage)
					.resize(400, 300, { fit: 'contain' })
					.webp({ quality: 80 })
					.toBuffer()
			})

			expect(ms).toBeLessThan(100)
		})

		it('should resize large image (4096×3072 → 800×600 WebP) under 500ms', async () => {
			const ms = await measureMs(async () => {
				await sharp(largeImage)
					.resize(800, 600, { fit: 'contain' })
					.webp({ quality: 80 })
					.toBuffer()
			})

			expect(ms).toBeLessThan(500)
		})

		it('should resize XL image (8192×4320 → 1920×1080 WebP) under 1500ms', async () => {
			const ms = await measureMs(async () => {
				await sharp(xlImage)
					.resize(1920, 1080, { fit: 'contain' })
					.webp({ quality: 80 })
					.toBuffer()
			})

			expect(ms).toBeLessThan(1500)
		})
	})

	describe('format Conversion Throughput', () => {
		const formats = [
			{ name: 'WebP', format: 'webp' as const, maxMs: 100 },
			{ name: 'JPEG', format: 'jpeg' as const, maxMs: 100 },
			{ name: 'PNG', format: 'png' as const, maxMs: 200 },
			{ name: 'AVIF', format: 'avif' as const, maxMs: 500 },
		]

		for (const { name, format, maxMs } of formats) {
			it(`should convert medium image to ${name} under ${maxMs}ms`, async () => {
				const ms = await measureMs(async () => {
					const pipeline = sharp(mediumImage).resize(800, 600, { fit: 'contain' })
					switch (format) {
						case 'webp':
							pipeline.webp({ quality: 80 })
							break
						case 'jpeg':
							pipeline.jpeg({ quality: 80, mozjpeg: true })
							break
						case 'png':
							pipeline.png({ quality: 80, compressionLevel: 6 })
							break
						case 'avif':
							pipeline.avif({ quality: 50, effort: 2 })
							break
					}
					await pipeline.toBuffer()
				})

				expect(ms).toBeLessThan(maxMs)
			})
		}
	})

	describe('webpImageManipulationJob Performance', () => {
		let job: WebpImageManipulationJob

		beforeAll(() => {
			job = new WebpImageManipulationJob()
		})

		it('should process default.png via job under 200ms', async () => {
			const options = makeResizeOptions({ width: 400, height: 300 })

			const ms = await measureMs(async () => {
				const result = await job.handle(DEFAULT_IMAGE_PATH, options)
				expect(result.buffer).toBeDefined()
				expect(result.buffer.length).toBeGreaterThan(0)
			})

			expect(ms).toBeLessThan(200)
		})

		it('should process buffer via handleBuffer under 200ms', async () => {
			const options = makeResizeOptions({ width: 800, height: 600 })

			const ms = await measureMs(async () => {
				const result = await job.handleBuffer(mediumImage, options)
				expect(result.buffer).toBeDefined()
				expect(result.format).toBeDefined()
			})

			expect(ms).toBeLessThan(200)
		})

		it('should process 10 sequential images under 2s', async () => {
			const options = makeResizeOptions({ width: 400, height: 300 })

			const ms = await measureMs(async () => {
				for (let i = 0; i < 10; i++) {
					await job.handleBuffer(mediumImage, options)
				}
			})

			expect(ms).toBeLessThan(2000)
		})

		it('should process AVIF with fallback for large images under 500ms', async () => {
			// Large image should trigger AVIF → WebP fallback (>2M pixels)
			const options = makeResizeOptions({
				width: 1920,
				height: 1080,
				format: SupportedResizeFormats.avif,
			})

			const ms = await measureMs(async () => {
				const result = await job.handleBuffer(largeImage, options)
				expect(result.buffer).toBeDefined()
				// Should be WebP due to fallback (4096*3072 > 2M pixels)
				expect(result.format).toBe('webp')
			})

			expect(ms).toBeLessThan(500)
		})
	})

	describe('concurrent Processing', () => {
		let job: WebpImageManipulationJob

		beforeAll(() => {
			job = new WebpImageManipulationJob()
		})

		it('should handle 5 concurrent medium image resizes under 2s', async () => {
			const options = makeResizeOptions({ width: 400, height: 300 })

			const ms = await measureMs(async () => {
				const tasks = []
				for (let i = 0; i < 5; i++)
					tasks.push(job.handleBuffer(mediumImage, options))
				await Promise.all(tasks)
			})

			expect(ms).toBeLessThan(2000)
		})

		it('should handle 10 concurrent small image resizes under 1s', async () => {
			const options = makeResizeOptions({ width: 100, height: 100 })

			const ms = await measureMs(async () => {
				const tasks = []
				for (let i = 0; i < 10; i++)
					tasks.push(job.handleBuffer(smallImage, options))
				await Promise.all(tasks)
			})

			expect(ms).toBeLessThan(1000)
		})

		it('should handle 20 concurrent small image resizes under 2s', async () => {
			const options = makeResizeOptions({ width: 100, height: 100 })

			const ms = await measureMs(async () => {
				const tasks = []
				for (let i = 0; i < 20; i++)
					tasks.push(job.handleBuffer(smallImage, options))
				await Promise.all(tasks)
			})

			expect(ms).toBeLessThan(2000)
		})

		it('should handle mixed concurrent workload (small + medium + large) under 3s', async () => {
			const ms = await measureMs(async () => {
				const tasks: Promise<unknown>[] = []
				for (let i = 0; i < 5; i++)
					tasks.push(job.handleBuffer(smallImage, makeResizeOptions({ width: 100, height: 100 })))
				for (let i = 0; i < 3; i++)
					tasks.push(job.handleBuffer(mediumImage, makeResizeOptions({ width: 400, height: 300 })))
				tasks.push(job.handleBuffer(largeImage, makeResizeOptions({ width: 800, height: 600 })))
				await Promise.all(tasks)
			})

			expect(ms).toBeLessThan(3000)
		})
	})

	describe('quality and Output Size', () => {
		it('should produce smaller output at lower quality', async () => {
			// Generate a noisy image (random pixel data) where quality differences matter
			const noiseBuffer = Buffer.alloc(800 * 600 * 3)
			for (let i = 0; i < noiseBuffer.length; i++) {
				noiseBuffer[i] = Math.floor(Math.random() * 256)
			}
			const source = await sharp(noiseBuffer, { raw: { width: 800, height: 600, channels: 3 } })
				.png()
				.toBuffer()

			const highQuality = await sharp(source)
				.webp({ quality: 95 })
				.toBuffer()

			const lowQuality = await sharp(source)
				.webp({ quality: 10 })
				.toBuffer()

			expect(lowQuality.length).toBeLessThan(highQuality.length)
		})

		it('should produce smaller output at smaller dimensions', async () => {
			const large = await sharp(mediumImage)
				.resize(1024, 768)
				.webp({ quality: 80 })
				.toBuffer()

			const small = await sharp(mediumImage)
				.resize(200, 150)
				.webp({ quality: 80 })
				.toBuffer()

			expect(small.length).toBeLessThan(large.length)
		})

		it('should not exceed reasonable output sizes', async () => {
			const result = await sharp(largeImage)
				.resize(1920, 1080)
				.webp({ quality: 80 })
				.toBuffer()

			// WebP at 1920x1080 q80 from solid color should be very small
			expect(result.length).toBeLessThan(1024 * 1024) // <1MB
		})
	})
})
