import { describe, expect, it } from 'vitest'
import { isSvgHeader, sanitizeSvg } from '#microservice/Cache/utils/svg-sanitizer.util'

const wrap = (inner: string): string => `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`

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

	it('rejects raster, HTML and empty headers', () => {
		expect(isSvgHeader('PNG\r\n\n')).toBe(false)
		expect(isSvgHeader('data:image/png;base64,abc=')).toBe(false)
		expect(isSvgHeader('<html><body></body></html>')).toBe(false)
		expect(isSvgHeader('<?xml version="1.0"?><root/>')).toBe(false)
		expect(isSvgHeader('')).toBe(false)
	})
})

describe('sanitizeSvg', () => {
	it('removes <script> elements but keeps benign shapes', () => {
		const out = sanitizeSvg(wrap('<script>alert(1)</script><rect width="10" height="10"/>'))
		expect(out.toLowerCase()).not.toContain('<script')
		expect(out).toContain('<rect')
	})

	it('removes on* event handlers', () => {
		const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect onclick="x()"/></svg>')
		expect(out).not.toMatch(/\son\w+\s*=/i)
	})

	it('removes <use>, <image>, and <feImage> SSRF vectors', () => {
		expect(sanitizeSvg(wrap('<use href="http://evil/x#a"/><rect/>')).toLowerCase()).not.toContain('<use')
		expect(sanitizeSvg(wrap('<image href="http://evil/x.png"/>')).toLowerCase()).not.toContain('<image')
		expect(sanitizeSvg(wrap('<feImage href="http://evil/x"/>')).toLowerCase()).not.toContain('<feimage')
	})

	it('strips javascript: and the href/xlink:href family', () => {
		const out = sanitizeSvg(wrap('<a href="javascript:alert(1)"><rect/></a>'))
		expect(out.toLowerCase()).not.toContain('javascript:')
		expect(out.toLowerCase()).not.toContain('href=')
	})

	it('neutralizes script-reassembly payloads (parser, not regex)', () => {
		// <scr<script>ipt> must not yield an executable <script> element — the
		// canonical case a single-pass regex strip would re-form.
		const out = sanitizeSvg(wrap('<scr<script>ipt>alert(1)</script>'))
		expect(out.toLowerCase()).not.toContain('<script')
	})

	it('neutralizes malformed closing tags', () => {
		const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script\t\n bar>x</svg>')
		expect(out.toLowerCase()).not.toContain('<script')
	})

	it('preserves benign SVG markup and attributes', () => {
		const out = sanitizeSvg(wrap('<rect width="10" height="10" fill="red"/>'))
		expect(out).toContain('<rect')
		expect(out).toContain('fill="red"')
	})
})
