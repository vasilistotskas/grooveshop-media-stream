import { Buffer } from 'node:buffer'
import { describe, expect, it } from 'vitest'
import { isSvgHeader, sanitizeSvg as sanitizeSvgWithLimits } from '#microservice/Cache/utils/svg-sanitizer.util'
import { ProcessingTimeoutError } from '#microservice/common/errors/media-stream.errors'

const wrap = (inner: string): string => `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`

// Every call spawns a real worker (jsdom loads in ~0.5 s), so the budget is generous.
const sanitizeSvg = (svg: string): Promise<string> => sanitizeSvgWithLimits(svg, { timeoutMs: 20_000 })

describe('isSvgHeader', () => {
	it('recognises a bare <svg root, with or without leading whitespace', () => {
		expect(isSvgHeader('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toBe(true)
		expect(isSvgHeader('\n\t  <svg width="10" height="10"/>')).toBe(true)
	})

	it('recognises an <svg root behind an XML declaration', () => {
		// The declaration used to defeat a plain startsWith('<svg') check
		const xmlPrefixed = '<?xml version="1.0" encoding="UTF-8"?>\n<svg width="100" height="100"><rect/></svg>'
		expect(xmlPrefixed.trimStart().startsWith('<svg')).toBe(false)
		expect(isSvgHeader(xmlPrefixed)).toBe(true)

		for (const declaration of [
			'<?xml version="1.0"?>',
			'<?xml version="1.0" encoding="UTF-8"?>',
			'<?xml version="1.1" standalone="yes"?>',
			'<?xml version="1.0" encoding="ISO-8859-1"?>\n',
		]) {
			expect(isSvgHeader(`${declaration}<svg />`)).toBe(true)
		}
	})

	it('recognises an <svg root behind a DOCTYPE, alone or after the XML declaration', () => {
		const doctype = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'
		expect(isSvgHeader(`${doctype}\n<svg><rect/></svg>`)).toBe(true)
		expect(isSvgHeader(`<?xml version="1.0"?>\n${doctype}\n<svg/>`)).toBe(true)
	})

	it('recognises the SVG namespace when something else precedes the root', () => {
		expect(isSvgHeader('<?xml version="1.0"?>\n<!-- exported -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(true)
	})

	it('accepts a UTF-8 byte-order mark before the root', () => {
		expect(isSvgHeader('﻿<svg xmlns="http://www.w3.org/2000/svg"/>')).toBe(true)
	})

	it('rejects raster, HTML and empty headers', () => {
		expect(isSvgHeader('PNG\r\n\n')).toBe(false)
		expect(isSvgHeader('data:image/png;base64,abc=')).toBe(false)
		expect(isSvgHeader('<html><body></body></html>')).toBe(false)
		expect(isSvgHeader('<?xml version="1.0"?><root/>')).toBe(false)
		expect(isSvgHeader('')).toBe(false)
	})

	it('rejects a raster whose metadata embeds an SVG in the first kilobyte (C2PA icon)', () => {
		// Shape of the PNGs that took production down on 2026-09-25: a C2PA
		// manifest in a caBX chunk right after IHDR, whose c2pa.icon assertion
		// is an image/svg+xml document — namespace and all — inside the sniff window.
		const c2paPng = Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]),
			Buffer.from('caBXjumbjumdc2pa.assertionsc2pa.iconimage/svg+xml'),
			Buffer.from('<svg width="716" height="716" viewBox="0 0 716 716" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'),
		]).toString('utf8')

		expect(c2paPng).toContain('xmlns="http://www.w3.org/2000/svg"')
		expect(isSvgHeader(c2paPng)).toBe(false)
	})

	it('rejects any header that does not open with markup, whatever it contains', () => {
		const avifBox = Buffer.from([0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70]).toString('utf8')
		expect(isSvgHeader(`${avifBox}avif <svg xmlns="http://www.w3.org/2000/svg">`)).toBe(false)
		expect(isSvgHeader('GIF89a xmlns="http://www.w3.org/2000/svg"')).toBe(false)
	})
})

describe('sanitizeSvg', () => {
	it('removes <script> elements but keeps benign shapes', async () => {
		const out = await sanitizeSvg(wrap('<script>alert(1)</script><rect width="10" height="10"/>'))
		expect(out.toLowerCase()).not.toContain('<script')
		expect(out).toContain('<rect')
	})

	it('removes on* event handlers', async () => {
		const out = await sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="x()"/></svg>')
		expect(out).not.toMatch(/\son\w+\s*=/i)
	})

	it('removes <use>, <image>, and <feImage> SSRF vectors', async () => {
		expect((await sanitizeSvg(wrap('<use href="http://evil/x#a"/><rect/>'))).toLowerCase()).not.toContain('<use')
		expect((await sanitizeSvg(wrap('<image href="http://evil/x.png"/>'))).toLowerCase()).not.toContain('<image')
		expect((await sanitizeSvg(wrap('<feImage href="http://evil/x"/>'))).toLowerCase()).not.toContain('<feimage')
	})

	it('strips javascript: and the href/xlink:href family', async () => {
		const out = await sanitizeSvg(wrap('<a href="javascript:alert(1)"><rect/></a>'))
		expect(out.toLowerCase()).not.toContain('javascript:')
		expect(out.toLowerCase()).not.toContain('href=')
	})

	it('neutralizes script-reassembly payloads (parser, not regex)', async () => {
		// <scr<script>ipt> must not yield an executable <script> element — the
		// canonical case a single-pass regex strip would re-form.
		const out = await sanitizeSvg(wrap('<scr<script>ipt>alert(1)</script>'))
		expect(out.toLowerCase()).not.toContain('<script')
	})

	it('neutralizes malformed closing tags', async () => {
		const out = await sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script\t\n bar>x</svg>')
		expect(out.toLowerCase()).not.toContain('<script')
	})

	it('preserves benign SVG markup and attributes', async () => {
		const out = await sanitizeSvg(wrap('<rect width="10" height="10" fill="red"/>'))
		expect(out).toContain('<rect')
		expect(out).toContain('fill="red"')
	})

	it('keeps an SVG that exhausts the worker heap out of the process heap (fail closed)', async () => {
		// 20 000 elements need ~350 MB of jsdom heap: in the main thread that
		// was a pod kill, in a 32 MB worker it is one rejected SVG.
		const huge = wrap('<rect x="1" y="2" width="3" height="4" fill="#abc"/>'.repeat(20_000))
		const heapBefore = process.memoryUsage().heapUsed

		await expect(sanitizeSvgWithLimits(huge, { timeoutMs: 20_000, heapLimitMb: 32 })).rejects.toThrow('SVG sanitization unavailable')
		expect(process.memoryUsage().heapUsed - heapBefore).toBeLessThan(64 * 1024 * 1024)
	})

	it('answers a sanitiser that outlives its budget with ProcessingTimeoutError', async () => {
		await expect(sanitizeSvgWithLimits(wrap('<rect/>'), { timeoutMs: 1 })).rejects.toBeInstanceOf(ProcessingTimeoutError)
	})
})
