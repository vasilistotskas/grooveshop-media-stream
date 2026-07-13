import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import {
	checkETagMatch,
	checkIfModifiedSince,
	formatLastModified,
	generateETag,
	generateWeakETag,
} from '#microservice/common/utils/etag.util'

describe('etag.util', () => {
	describe('generateETag', () => {
		it('should generate a quoted md5 strong ETag', () => {
			const etag = generateETag('hello')
			expect(etag).toMatch(/^"[a-f0-9]{32}"$/)
		})

		it('should be stable for identical content and differ for different content', () => {
			expect(generateETag('a')).toBe(generateETag('a'))
			expect(generateETag('a')).not.toBe(generateETag('b'))
		})

		it('should accept Buffers', () => {
			expect(generateETag(Buffer.from('hello'))).toBe(generateETag('hello'))
		})
	})

	describe('generateWeakETag', () => {
		it('should combine size, date, and format', () => {
			expect(generateWeakETag(1024, 1700000000000, 'webp')).toBe('W/"1024-1700000000000-webp"')
		})

		it('should omit the format segment when not provided', () => {
			expect(generateWeakETag('2048', 1700000000000)).toBe('W/"2048-1700000000000"')
		})
	})

	describe('checkETagMatch', () => {
		const current = 'W/"1024-1700000000000-webp"'

		it('should return false without a request ETag', () => {
			expect(checkETagMatch(undefined, current)).toBe(false)
		})

		it('should match an identical weak ETag', () => {
			expect(checkETagMatch(current, current)).toBe(true)
		})

		it('should match weak against strong (weak comparison)', () => {
			expect(checkETagMatch('"1024-1700000000000-webp"', current)).toBe(true)
		})

		it('should match any of multiple ETags in If-None-Match', () => {
			expect(checkETagMatch('"other", W/"1024-1700000000000-webp"', current)).toBe(true)
		})

		it('should match the wildcard', () => {
			expect(checkETagMatch('*', current)).toBe(true)
		})

		it('should not match a different ETag', () => {
			expect(checkETagMatch('W/"999-1-png"', current)).toBe(false)
		})
	})

	describe('checkIfModifiedSince', () => {
		const lastModified = new Date('2026-01-01T00:00:00Z').getTime()

		it('should report modified when the header is missing', () => {
			expect(checkIfModifiedSince(undefined, lastModified)).toBe(true)
		})

		it('should report NOT modified when the resource is older than the header date', () => {
			expect(checkIfModifiedSince('Fri, 02 Jan 2026 00:00:00 GMT', lastModified)).toBe(false)
		})

		it('should report modified when the resource is newer than the header date', () => {
			expect(checkIfModifiedSince('Wed, 31 Dec 2025 00:00:00 GMT', lastModified)).toBe(true)
		})

		it('should accept a Date object for lastModified', () => {
			expect(checkIfModifiedSince('Wed, 31 Dec 2025 00:00:00 GMT', new Date(lastModified))).toBe(true)
		})

		it('should treat an unparseable header as modified', () => {
			expect(checkIfModifiedSince('not-a-date', lastModified)).toBe(true)
		})
	})

	describe('formatLastModified', () => {
		it('should format a timestamp as a UTC string', () => {
			expect(formatLastModified(0)).toBe('Thu, 01 Jan 1970 00:00:00 GMT')
		})

		it('should format a Date as a UTC string', () => {
			expect(formatLastModified(new Date(0))).toBe('Thu, 01 Jan 1970 00:00:00 GMT')
		})
	})
})
