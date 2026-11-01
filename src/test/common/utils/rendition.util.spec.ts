import type { RenditionRequest } from '#microservice/common/utils/rendition.util'
import { describe, expect, it } from 'vitest'
import { FitOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { MAX_IMAGE_HEIGHT, MAX_TOTAL_PIXELS } from '#microservice/common/constants/image-limits.constant'
import { MAX_RENDITION_WIDTH, RENDITION_QUALITIES, RENDITION_WIDTHS } from '#microservice/common/constants/rendition-presets.constant'
import { toRendition } from '#microservice/common/utils/rendition.util'

const AVIF_MAX_QUALITY = 55

function rendition(overrides: Partial<RenditionRequest>): ReturnType<typeof toRendition> {
	return toRendition({
		width: 640,
		height: 480,
		fit: FitOptions.cover,
		position: 'attention',
		format: SupportedResizeFormats.avif,
		quality: 80,
		...overrides,
	}, AVIF_MAX_QUALITY)
}

describe('rendition presets', () => {
	it('keeps the width ladder ascending, one grain or at most 17 % between steps, ending at the cap', () => {
		const steps = RENDITION_WIDTHS.slice(1).map((step, index) => ({ step, previous: RENDITION_WIDTHS[index] }))
		expect(steps.every(({ step, previous }) => step > previous)).toBe(true)
		expect(steps.every(({ step, previous }) => step - previous <= 16 || step / previous <= 1.17)).toBe(true)
		expect(RENDITION_WIDTHS.at(-1)).toBe(MAX_RENDITION_WIDTH)
	})

	describe('dimensions', () => {
		it.each([
			// The widths of the 2026-10 request logs, most requested first.
			[672, 672],
			[1040, 1088],
			[704, 752],
			[382, 416],
			[1124, 1232],
			[1440, 1568],
			[480, 528],
			[132, 144],
			[2000, 2048],
		])('rounds a width of %i up to %i', (requested, expected) => {
			expect(rendition({ width: requested, height: 0, fit: FitOptions.inside }).width).toBe(expected)
		})

		it('never goes below the requested width', () => {
			for (let width = 1; width <= MAX_RENDITION_WIDTH; width++) {
				expect(rendition({ width, height: 0 }).width).toBeGreaterThanOrEqual(width)
			}
		})

		it('maps every width to a ladder step', () => {
			for (let width = 1; width <= 8192; width++) {
				expect(RENDITION_WIDTHS).toContain(rendition({ width, height: 0 }).width)
			}
		})

		it('keeps the aspect ratio of a request with both axes, rounding the height', () => {
			expect(rendition({ width: 704, height: 820 })).toMatchObject({ width: 752, height: 876 })
			expect(rendition({ width: 650, height: 328 })).toMatchObject({ width: 672, height: 339 })
			expect(rendition({ width: 264, height: 264 })).toMatchObject({ width: 288, height: 288 })
		})

		it('snaps the height of a request with a height only', () => {
			expect(rendition({ width: 0, height: 300 })).toMatchObject({ width: 0, height: 320 })
		})

		it('caps a request wider than the widest preset', () => {
			expect(rendition({ width: 4000, height: 3000 })).toMatchObject({ width: MAX_RENDITION_WIDTH, height: 1536 })
			expect(rendition({ width: 8192, height: 0 }).width).toBe(MAX_RENDITION_WIDTH)
		})

		it('bounds the original size (0 x 0) at the widest preset', () => {
			expect(rendition({ width: 0, height: 0, fit: FitOptions.inside })).toMatchObject({ width: MAX_RENDITION_WIDTH, height: 0 })
		})

		it('keeps a request as asked when the snap would leave the pixel budget', () => {
			const extreme = rendition({ width: 1, height: 8000 })
			expect(extreme).toMatchObject({ width: 1, height: 8000 })
			expect(extreme.height).toBeLessThanOrEqual(MAX_IMAGE_HEIGHT)
			expect(extreme.width * extreme.height).toBeLessThanOrEqual(MAX_TOTAL_PIXELS)
		})

		it.each([
			[672, 340],
			[704, 820],
			[264, 264],
			[1000, 1000],
			[300, 0],
			[0, 300],
			[0, 0],
			[4000, 3000],
		])('is idempotent: the preset of %i x %i maps to itself', (width, height) => {
			const first = rendition({ width, height })
			expect(rendition({ width: first.width, height: first.height })).toEqual(first)
		})
	})

	describe('position', () => {
		it('treats centre as center', () => {
			expect(rendition({ position: 'centre' }).position).toBe('center')
		})

		it('keeps the position of a cover or contain request', () => {
			expect(rendition({ fit: FitOptions.cover, position: 'attention' }).position).toBe('attention')
			expect(rendition({ fit: FitOptions.contain, position: 'entropy' }).position).toBe('entropy')
		})

		it.each([FitOptions.inside, FitOptions.outside, FitOptions.fill])('drops the position of a %s request, which ignores it', (fit) => {
			expect(rendition({ fit, position: 'entropy' }).position).toBe('center')
		})
	})

	describe('quality', () => {
		it('caps AVIF at the ceiling and leaves a lower request alone', () => {
			expect(rendition({ quality: 100 }).quality).toBe(AVIF_MAX_QUALITY)
			expect(rendition({ quality: 40 }).quality).toBe(40)
		})

		it.each([
			[50, 60],
			[75, 80],
			[80, 80],
			[85, 90],
			[90, 90],
			[95, 100],
			[100, 100],
		])('rounds a WebP quality of %i up to %i', (requested, expected) => {
			expect(rendition({ format: SupportedResizeFormats.webp, quality: requested }).quality).toBe(expected)
		})

		it('uses the same ladder for JPEG and PNG', () => {
			for (const format of [SupportedResizeFormats.jpeg, SupportedResizeFormats.png]) {
				expect(RENDITION_QUALITIES).toContain(rendition({ format, quality: 85 }).quality)
			}
		})

		it('gives GIF and TIFF one quality, which they ignore', () => {
			expect(rendition({ format: SupportedResizeFormats.gif, quality: 10 }).quality).toBe(100)
			expect(rendition({ format: SupportedResizeFormats.tiff, quality: 70 }).quality).toBe(100)
		})
	})
})
