import DOMPurify from 'isomorphic-dompurify'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

/**
 * Sanitize an SVG payload against XSS / SSRF vectors before it is either
 * served with `Content-Type: image/svg+xml` (the no-resize path, where the
 * bytes reach a browser and can execute script if opened top-level) or
 * rasterized by Sharp (the resize path).
 *
 * DOMPurify (isomorphic-dompurify, jsdom-backed) is the **authoritative**
 * sanitizer: a real DOM parser/serializer purpose-built for SVG/HTML XSS.
 * With the config below it structurally removes `<script>`, `<use>`,
 * `<image>`, `<feImage>`, every `on*` event handler, and the
 * `href`/`xlink:href` family (SSRF vectors) — including malformed and
 * reassembly payloads such as `<scr<script>ipt>` and `</script\t\n bar>`,
 * which it handles by parsing, not pattern-matching.
 *
 * A regex `.replace()` post-pass was deliberately **removed**: regex HTML
 * filtering is bypassable (the "incomplete multi-character sanitization" /
 * "bad tag filter" CVE class — removing a match can re-form the pattern),
 * strictly weaker than the parser, and empirically added no coverage
 * DOMPurify does not already provide. Relying on the parser alone is both
 * more correct and eliminates a false sense of security.
 *
 * Fail closed: if DOMPurify errors, or if its output somehow still contains a
 * `<script` element, the SVG is rejected (the pipeline then serves the
 * default image) rather than served unsanitized.
 */
export function sanitizeSvg(svg: string): string {
	let sanitized: string
	try {
		sanitized = DOMPurify.sanitize(svg, {
			USE_PROFILES: { svg: true, svgFilters: true },
			FORBID_TAGS: ['script', 'use', 'image', 'feimage'],
			FORBID_ATTR: ['xlink:href', 'href', 'action', 'formaction'],
			// Keep SVG structure intact; don't wrap in <div>
			WHOLE_DOCUMENT: false,
			RETURN_DOM: false,
		}) as string
	}
	catch (err: unknown) {
		CorrelatedLogger.error(
			`DOMPurify SVG sanitization failed — rejecting SVG (fail closed): ${(err as Error).message}`,
			(err as Error).stack,
			'SvgSanitizer',
		)
		throw new Error('SVG sanitization unavailable')
	}

	// Defence-in-depth tripwire: detection-and-reject, NOT stripping. DOMPurify's
	// FORBID_TAGS config guarantees no <script> survives; a residual one implies a
	// library regression or misconfiguration, so fail closed rather than serve it.
	if (sanitized.toLowerCase().includes('<script')) {
		CorrelatedLogger.error('Sanitized SVG unexpectedly still contains a <script element — rejecting', undefined, 'SvgSanitizer')
		throw new Error('SVG sanitization incomplete')
	}

	return sanitized
}
