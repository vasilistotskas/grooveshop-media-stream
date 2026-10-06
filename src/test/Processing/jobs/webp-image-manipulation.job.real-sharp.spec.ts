import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BackgroundOptions, FitOptions, PositionOptions, ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import WebpImageManipulationJob from '#microservice/Processing/jobs/webp-image-manipulation.job'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

/**
 * Real Sharp output for the "never upscale, keep the requested aspect" rule.
 * The mocked spec next to this one pins the resize arguments; this one proves
 * the pixels that come out.
 */
describe('webpImageManipulationJob output geometry (real Sharp)', () => {
	const job = new WebpImageManipulationJob(createConfigServiceMock({ 'processing.timeoutSeconds': 20 }))
	let directory: string
	let square800: string
	let small300x200: string
	let small500x400: string
	let large2000x1500: string
	let rotated: string

	function options(overrides: Partial<ResizeOptions>): ResizeOptions {
		return new ResizeOptions({
			width: 1040,
			height: 684,
			fit: FitOptions.cover,
			position: PositionOptions.centre,
			background: BackgroundOptions.transparent,
			trimThreshold: 0,
			format: SupportedResizeFormats.png,
			quality: 80,
			...overrides,
		})
	}

	async function dimensions(path: string, overrides: Partial<ResizeOptions>): Promise<{ width: number, height: number }> {
		const { buffer } = await job.handle(path, options(overrides))
		const { width, height } = await sharp(buffer).metadata()
		return { width, height }
	}

	async function jpeg(name: string, width: number, height: number, orientation?: number): Promise<string> {
		const path = join(directory, name)
		const pipeline = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
		await writeFile(path, await (orientation ? pipeline.jpeg().withMetadata({ orientation }) : pipeline.jpeg()).toBuffer())
		return path
	}

	beforeAll(async () => {
		directory = await mkdtemp(join(tmpdir(), 'ms-geometry-'))
		square800 = await jpeg('square800.jpg', 800, 800)
		small300x200 = await jpeg('small300x200.jpg', 300, 200)
		small500x400 = await jpeg('small500x400.jpg', 500, 400)
		large2000x1500 = await jpeg('large2000x1500.jpg', 2000, 1500)
		// Stored 600x800 with orientation 6: displayed as 800x600.
		rotated = await jpeg('rotated.jpg', 600, 800, 6)
	})

	afterAll(async () => {
		await rm(directory, { recursive: true, force: true })
	})

	describe('source smaller than the request', () => {
		it.each([FitOptions.cover, FitOptions.fill])('%s returns the request scaled down to fit the source, at the requested aspect', async (fit) => {
			// 800x800 asked for 1040x684: width is the limiting axis, 684 * 800/1040 = 526.15
			expect(await dimensions(square800, { fit })).toEqual({ width: 800, height: 526 })
		})

		it('cover limits on the height when the source is wide', async () => {
			// 300x200 asked for 800x800: height limits, the box is 200x200
			expect(await dimensions(small300x200, { fit: FitOptions.cover, width: 800, height: 800 })).toEqual({ width: 200, height: 200 })
		})

		it('contain pads the source at 1:1 to the smallest box of the requested aspect', async () => {
			// 500x400 asked for 1040x684: height is the tighter ratio (400/684), so the
			// box is the request scaled by it: ceil(1040 * 400/684 = 608.2) = 609 wide.
			expect(await dimensions(small500x400, { fit: FitOptions.contain })).toEqual({ width: 609, height: 400 })
		})

		it('contain with the source larger on one axis downscales into the requested box as before', async () => {
			// 800x800 is taller than 684, so the request is honoured: 684x684 padded to 1040x684.
			expect(await dimensions(square800, { fit: FitOptions.contain })).toEqual({ width: 1040, height: 684 })
		})

		it('contain keeps the source at its own size inside the padded box', async () => {
			const { buffer } = await job.handle(small300x200, options({ fit: FitOptions.contain, width: 800, height: 800 }))
			const { width, height } = await sharp(buffer).metadata()
			expect({ width, height }).toEqual({ width: 300, height: 300 })
			const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
			const alphaAt = (x: number, y: number): number => data[((y * info.width) + x) * info.channels + 3]
			expect(alphaAt(150, 150)).toBe(255)
			expect(alphaAt(150, 5)).toBe(0)
		})

		it('outside and inside keep the source size and aspect', async () => {
			expect(await dimensions(small300x200, { fit: FitOptions.outside, width: 800, height: 800 })).toEqual({ width: 300, height: 200 })
			expect(await dimensions(small300x200, { fit: FitOptions.inside, width: 800, height: 800 })).toEqual({ width: 300, height: 200 })
		})

		it('swaps the axes of an orientation-6 source', async () => {
			// Displayed 800x600 asked for 1040x684: width limits, 684 * 800/1040 = 526
			expect(await dimensions(rotated, { fit: FitOptions.cover })).toEqual({ width: 800, height: 526 })
			// Unswapped it would read as 600 wide and give 600x395.
		})

		it('crops by position as usual', async () => {
			// Top half red, bottom half blue: a top crop keeps the red, a bottom crop the blue.
			const halves = join(directory, 'halves.png')
			await sharp({ create: { width: 800, height: 800, channels: 3, background: { r: 255, g: 0, b: 0 } } })
				.composite([{ input: { create: { width: 800, height: 400, channels: 3, background: { r: 0, g: 0, b: 255 } } }, top: 400, left: 0 }])
				.png()
				.toFile(halves)

			async function centrePixel(position: PositionOptions): Promise<number[]> {
				const { buffer } = await job.handle(halves, options({ fit: FitOptions.cover, position }))
				const { data, info } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true })
				expect(info).toMatchObject({ width: 800, height: 526 })
				const offset = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels
				return [...data.subarray(offset, offset + 3)]
			}

			// The 526 px crop of an 800 px tall source spans rows 0-525 (top) or 274-799 (bottom);
			// the centre row sits at 263 (red) or 537 (blue).
			expect(await centrePixel(PositionOptions.top)).toEqual([255, 0, 0])
			expect(await centrePixel(PositionOptions.bottom)).toEqual([0, 0, 255])
		})
	})

	describe('single dimension requested', () => {
		it('never upscales and follows the source aspect', async () => {
			expect(await dimensions(small300x200, { fit: FitOptions.cover, width: 1000, height: 0 })).toEqual({ width: 300, height: 200 })
			expect(await dimensions(small300x200, { fit: FitOptions.cover, width: 0, height: 1000 })).toEqual({ width: 300, height: 200 })
		})
	})

	describe('source larger than the request', () => {
		it.each([FitOptions.cover, FitOptions.fill, FitOptions.contain])('%s returns the requested box exactly', async (fit) => {
			expect(await dimensions(large2000x1500, { fit })).toEqual({ width: 1040, height: 684 })
		})

		it('contain still pads to the requested box when only one axis is smaller', async () => {
			// 300x200 source, 200x800 request: width ratio 1.5, height ratio 0.25; the
			// source is larger on width, so the request is honoured as before.
			expect(await dimensions(small300x200, { fit: FitOptions.contain, width: 200, height: 800 })).toEqual({ width: 200, height: 800 })
		})
	})
})
