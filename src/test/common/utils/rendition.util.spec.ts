import type { RenditionRequest } from '#microservice/common/utils/rendition.util'
import { describe, expect, it } from 'vitest'
import { FitOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { MAX_IMAGE_HEIGHT, MAX_TOTAL_PIXELS } from '#microservice/common/constants/image-limits.constant'
import { KNOWN_RENDITION_SIZES, MAX_RENDITION_WIDTH, RENDITION_QUALITIES, RENDITION_WIDTHS } from '#microservice/common/constants/rendition-presets.constant'
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
			[1300, 1392],
			[480, 528],
			[132, 144],
			[2400, 2048],
		])('rounds an unknown single-axis width of %i up to %i', (requested, expected) => {
			expect(rendition({ width: requested, height: 0, fit: FitOptions.inside }).width).toBe(expected)
		})

		it('answers every size the storefront asks for exactly, at no extra pixel', () => {
			for (const size of KNOWN_RENDITION_SIZES) {
				const [width, height] = size.split('x').map(Number)
				expect(rendition({ width, height })).toMatchObject({ width, height })
			}
			expect(KNOWN_RENDITION_SIZES.size).toBeGreaterThan(40)
		})

		it('keeps every known size inside the pixel budget and the width cap', () => {
			for (const size of KNOWN_RENDITION_SIZES) {
				const [width, height] = size.split('x').map(Number)
				expect(width).toBeLessThanOrEqual(MAX_RENDITION_WIDTH)
				expect(width * height).toBeLessThanOrEqual(MAX_TOTAL_PIXELS)
			}
		})

		it('does not know the original size, which is capped instead', () => {
			expect(KNOWN_RENDITION_SIZES.has('0x0')).toBe(false)
		})

		it('never goes below the requested width', () => {
			for (let width = 1; width <= MAX_RENDITION_WIDTH; width++) {
				expect(rendition({ width, height: 0 }).width).toBeGreaterThanOrEqual(width)
			}
		})

		it('maps every unknown width to a ladder step', () => {
			const unknown = Array.from({ length: 8192 }, (_, index) => index + 1).filter(width => !KNOWN_RENDITION_SIZES.has(`${width}x0`))
			expect(unknown.every(width => RENDITION_WIDTHS.includes(rendition({ width, height: 0 }).width))).toBe(true)
		})

		it('keeps the aspect ratio of a request with both axes, rounding the height', () => {
			expect(rendition({ width: 700, height: 410 })).toMatchObject({ width: 752, height: 440 })
			expect(rendition({ width: 650, height: 328 })).toMatchObject({ width: 672, height: 339 })
			expect(rendition({ width: 270, height: 270 })).toMatchObject({ width: 288, height: 288 })
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
			[50, 75],
			[75, 75],
			[80, 80],
			[82, 85],
			[85, 85],
			[90, 90],
			[95, 100],
			[100, 100],
		])('keeps a known WebP quality and rounds any other up: %i gives %i', (requested, expected) => {
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
