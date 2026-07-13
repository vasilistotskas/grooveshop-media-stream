import { describe, expect, it, vi } from 'vitest'
import { sanitizeSvg } from '#microservice/Cache/utils/svg-sanitizer.util'

// Isolated in its own file so the module mock doesn't affect the real-DOMPurify
// behavioural spec. vi.hoisted lets the (hoisted) vi.mock factory reference the mock.
const { sanitizeMock } = vi.hoisted(() => ({ sanitizeMock: vi.fn() }))
vi.mock('isomorphic-dompurify', () => ({ default: { sanitize: sanitizeMock } }))

describe('sanitizeSvg — fail closed', () => {
	it('rejects the SVG when DOMPurify throws', () => {
		sanitizeMock.mockImplementationOnce(() => {
			throw new Error('jsdom exploded')
		})

		expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"/>'))
			.toThrow('SVG sanitization unavailable')
	})

	it('rejects the SVG when a <script element survives sanitization (tripwire)', () => {
		// Simulate a DOMPurify misconfiguration/regression that lets a script through.
		sanitizeMock.mockReturnValueOnce('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

		expect(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"/>'))
			.toThrow('SVG sanitization incomplete')
	})

	it('returns the sanitized markup on the normal path', () => {
		sanitizeMock.mockReturnValueOnce('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')

		expect(sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect onclick="x()"/></svg>'))
			.toBe('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')
	})
})
