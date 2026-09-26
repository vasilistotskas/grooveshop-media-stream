import { Buffer } from 'node:buffer'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { FORMAT_SNIFF_BYTES, sniffImageFormat } from '#microservice/Cache/utils/image-format-sniff.util'

/** An ISO BMFF `ftyp` box: size, `ftyp`, major brand, minor version 0, compatible brands. */
function ftyp(major: string, compatible: string[]): Buffer {
	const size = 16 + 4 * compatible.length
	const box = Buffer.alloc(size)
	box.writeUInt32BE(size, 0)
	box.write('ftyp', 4, 'latin1')
	box.write(major, 8, 'latin1')
	compatible.forEach((brand, index) => box.write(brand, 16 + 4 * index, 'latin1'))
	return box
}

describe('sniffImageFormat', () => {
	// The sniffer must agree with what Sharp writes (and therefore reads).
	it.each(['png', 'jpeg', 'webp', 'gif', 'tiff', 'avif'] as const)('recognises a %s encoded by Sharp', async (format) => {
		const encoded = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } })
			.toFormat(format)
			.toBuffer()

		expect(sniffImageFormat(encoded.subarray(0, FORMAT_SNIFF_BYTES))).toBe(format)
	})

	it('recognises AVIF declared only among the compatible brands', () => {
		expect(sniffImageFormat(ftyp('mif1', ['mif1', 'miaf', 'avif']))).toBe('avif')
		expect(sniffImageFormat(ftyp('avis', []))).toBe('avif')
	})

	it('refuses HEIF that is not AVIF (HEVC-coded HEIC)', () => {
		expect(sniffImageFormat(ftyp('heic', ['mif1', 'heic']))).toBeNull()
	})

	it('recognises big-endian TIFF and BigTIFF', () => {
		expect(sniffImageFormat(Buffer.from([0x4D, 0x4D, 0x00, 0x2A, 0x00]))).toBe('tiff')
		expect(sniffImageFormat(Buffer.from([0x49, 0x49, 0x2B, 0x00, 0x08]))).toBe('tiff')
	})

	it('recognises SVG through the same check the pipeline uses', () => {
		expect(sniffImageFormat(Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('svg')
		expect(sniffImageFormat(Buffer.from('﻿  <svg width="1" height="1"/>'))).toBe('svg')
	})

	// 2026-09-25: a C2PA-tagged PNG carries an SVG icon in its first kilobyte.
	it('reads a PNG with an SVG in its metadata as PNG', () => {
		const c2paPng = Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
			Buffer.from('\x00\x00\x00\x0DcaBXimage/svg+xml<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>', 'latin1'),
		])

		expect(sniffImageFormat(c2paPng)).toBe('png')
	})

	it('refuses everything else', () => {
		expect(sniffImageFormat(Buffer.alloc(0))).toBeNull()
		expect(sniffImageFormat(Buffer.from([0x1F, 0x8B, 0x08]))).toBeNull() // gzip / .svgz
		expect(sniffImageFormat(Buffer.from([0x08, 0xF2, 0xA6, 0xB6]))).toBeNull() // libvips .v
		expect(sniffImageFormat(Buffer.from('BM\x00\x00', 'latin1'))).toBeNull() // BMP
		expect(sniffImageFormat(Buffer.from('<html><body/></html>'))).toBeNull()
		expect(sniffImageFormat(Buffer.from('RIFF\x00\x00\x00\x00WAVE', 'latin1'))).toBeNull()
	})
})
