import { describe, expect, it } from 'vitest'
import { sanitizeSvg } from '#microservice/Cache/utils/svg-sanitizer.util'

const wrap = (inner: string): string => `<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`

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
