import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MAX_FILE_SIZES, SHARP_INPUT_PIXEL_LIMIT } from '#microservice/common/constants/image-limits.constant'

/**
 * `contract/image-limits.json` is what grooveshop-django-api copies (pinned by
 * git id) to refuse, at upload, an image this service would refuse at render.
 * It is only worth that if it says what the service enforces: this holds it
 * equal to the constants the pipeline reads.
 */
const CONTRACT_FILE = resolve(import.meta.dirname, '../../../../contract/image-limits.json')
const contract = JSON.parse(readFileSync(CONTRACT_FILE, 'utf8')) as {
	maxFileBytes: Record<string, number>
	sourcePixelLimit: number
}

describe('contract/image-limits.json', () => {
	it('names exactly the source formats the pipeline accepts, with their size caps', () => {
		expect(contract.maxFileBytes).toEqual(MAX_FILE_SIZES)
	})

	it('carries the pixel limit every pipeline input is held to', () => {
		expect(contract.sourcePixelLimit).toBe(SHARP_INPUT_PIXEL_LIMIT)
	})

	it('holds only whole positive byte counts', () => {
		for (const bytes of Object.values(contract.maxFileBytes)) {
			expect(Number.isInteger(bytes) && bytes > 0).toBe(true)
		}
	})
})
