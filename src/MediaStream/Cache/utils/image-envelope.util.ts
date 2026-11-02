import { Buffer } from 'node:buffer'

/**
 * Binary envelope for a cached image: [0x00][u32 metadata length][metadata JSON][raw bytes].
 * 0x00 can never start a JSON document, so plain-JSON values stay distinguishable.
 * Redis and the rendition store hold images in this one form.
 */
const BINARY_MARKER = 0x00
const BINARY_HEADER_BYTES = 5

export function encodeImageEnvelope(rest: object, data: Buffer): Buffer {
	const metaJson = Buffer.from(JSON.stringify(rest), 'utf8')
	const header = Buffer.alloc(BINARY_HEADER_BYTES)
	header[0] = BINARY_MARKER
	header.writeUInt32BE(metaJson.length, 1)
	return Buffer.concat([header, metaJson, data])
}

/**
 * The fields and the image bytes of an envelope, or null when `value` is not
 * one. The bytes are a subarray view: no copy of the image.
 */
export function decodeImageEnvelope(value: Buffer): { rest: Record<string, unknown>, data: Buffer } | null {
	if (value.length < BINARY_HEADER_BYTES || value[0] !== BINARY_MARKER) {
		return null
	}
	const metaLength = value.readUInt32BE(1)
	if (metaLength === 0 || BINARY_HEADER_BYTES + metaLength > value.length) {
		return null
	}
	return {
		rest: JSON.parse(value.toString('utf8', BINARY_HEADER_BYTES, BINARY_HEADER_BYTES + metaLength)),
		data: value.subarray(BINARY_HEADER_BYTES + metaLength),
	}
}
