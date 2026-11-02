import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { decodeImageEnvelope, encodeImageEnvelope } from '#microservice/Cache/utils/image-envelope.util'

describe('image envelope', () => {
	it('round-trips the fields and the bytes', () => {
		const data = Buffer.from([0, 1, 2, 255])

		const decoded = decodeImageEnvelope(encodeImageEnvelope({
			metadata: { format: 'avif' },
		}, data))

		expect(decoded?.rest).toEqual({
			metadata: { format: 'avif' },
		})
		expect(decoded?.data.equals(data)).toBe(true)
	})

	it('returns the bytes as a view of the input, without copying the image', () => {
		const encoded = encodeImageEnvelope({ a: 1 }, Buffer.from('bytes'))

		expect(decodeImageEnvelope(encoded)?.data.buffer).toBe(encoded.buffer)
	})

	it('is null for a value that is not an envelope: JSON, empty, a short header, or a length past the end', () => {
		expect(decodeImageEnvelope(Buffer.from('{"a":1}'))).toBeNull()
		expect(decodeImageEnvelope(Buffer.alloc(0))).toBeNull()
		expect(decodeImageEnvelope(Buffer.from([0, 0]))).toBeNull()
		expect(decodeImageEnvelope(Buffer.from([0, 0, 0, 0, 0]))).toBeNull()
		expect(decodeImageEnvelope(Buffer.from([0, 0, 0, 255, 255, 1]))).toBeNull()
	})
})
