import type { Buffer } from 'node:buffer'
import type { SourceImageFormat } from '#microservice/common/constants/image-limits.constant'
import { isSvgHeader, SVG_SNIFF_BYTES } from './svg-sanitizer.util.js'

/** Bytes of a fetched file the sniffer needs: the SVG window, which covers every raster signature too. */
export const FORMAT_SNIFF_BYTES = SVG_SNIFF_BYTES

/** PNG signature (PNG specification, 3rd edition, §5.2). */
const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]
/** JPEG SOI marker followed by the next marker's 0xFF (ITU-T T.81, B.1.1.3). */
const JPEG_SIGNATURE = [0xFF, 0xD8, 0xFF]
/** TIFF byte-order mark + version 42, and BigTIFF's 43 (TIFF 6.0 §2; BigTIFF design). */
const TIFF_SIGNATURES = [
	[0x49, 0x49, 0x2A, 0x00],
	[0x4D, 0x4D, 0x00, 0x2A],
	[0x49, 0x49, 0x2B, 0x00],
	[0x4D, 0x4D, 0x00, 0x2B],
]
/** ISO BMFF brands that declare an AVIF image or image sequence (AV1 Image File Format, §9). */
const AVIF_BRANDS = new Set(['avif', 'avis'])

function startsWith(head: Buffer, signature: readonly number[]): boolean {
	return head.length >= signature.length && signature.every((byte, index) => head[index] === byte)
}

/**
 * An ISO BMFF file opens with its `ftyp` box: size, `ftyp`, major brand,
 * minor version, then compatible brands up to the box size (ISO/IEC
 * 14496-12 §4.3). AVIF may use `mif1` as the major brand and list `avif`
 * among the compatible ones, so every brand is checked.
 */
function isAvif(head: Buffer): boolean {
	if (head.length < 12 || head.toString('latin1', 4, 8) !== 'ftyp') {
		return false
	}
	if (AVIF_BRANDS.has(head.toString('latin1', 8, 12))) {
		return true
	}
	const boxEnd = Math.min(head.readUInt32BE(0), head.length)
	for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
		if (AVIF_BRANDS.has(head.toString('latin1', offset, offset + 4))) {
			return true
		}
	}
	return false
}

/**
 * The real format of a fetched file from its first `FORMAT_SNIFF_BYTES`,
 * or null when it is none the pipeline accepts. Raster formats are matched
 * on their binary signature first; SVG through `isSvgHeader`, the same
 * check that decides between the SVG and raster pipelines, so the size
 * limit and the pipeline can never disagree about what a file is.
 */
export function sniffImageFormat(head: Buffer): SourceImageFormat | null {
	if (startsWith(head, PNG_SIGNATURE)) {
		return 'png'
	}
	if (startsWith(head, JPEG_SIGNATURE)) {
		return 'jpeg'
	}
	const gifVersion = head.toString('latin1', 0, 6)
	if (gifVersion === 'GIF87a' || gifVersion === 'GIF89a') {
		return 'gif'
	}
	// RIFF container with the WEBP form type (RFC 9649 §2.5).
	if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') {
		return 'webp'
	}
	if (TIFF_SIGNATURES.some(signature => startsWith(head, signature))) {
		return 'tiff'
	}
	if (isAvif(head)) {
		return 'avif'
	}
	if (isSvgHeader(head.toString('utf8', 0, Math.min(head.length, FORMAT_SNIFF_BYTES)))) {
		return 'svg'
	}
	return null
}
