import { describe, expect, it } from 'vitest'
import { decodePathFully } from '#microservice/common/utils/percent-decode.util'

describe('decodePathFully', () => {
	it('returns a plain path untouched', () => {
		expect(decodePathFully('media/acme/uploads/a/b.jpg')).toBe('media/acme/uploads/a/b.jpg')
	})

	it('decodes a single layer', () => {
		expect(decodePathFully('media/acme/uploads/%CF%84.jpg')).toBe('media/acme/uploads/τ.jpg')
	})

	it('decodes double-encoded input', () => {
		expect(decodePathFully('media%2Facme%2Fuploads%2F%25CF%2584.jpg')).toBe('media/acme/uploads/τ.jpg')
	})

	it('stops after three passes', () => {
		// five layers of encoding on "%": three passes strip three
		expect(decodePathFully('%2525252525')).toBe('%2525')
	})

	it('throws URIError on malformed encoding', () => {
		expect(() => decodePathFully('media/%E0%A4%A')).toThrow(URIError)
	})
})
