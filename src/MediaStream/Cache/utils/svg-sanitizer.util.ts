import DOMPurify from 'isomorphic-dompurify'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

/**
 * Strip script-like content and XXE/SSRF vectors from an SVG payload.
 *
 * SVG served with Content-Type: image/svg+xml can execute JavaScript when
 * opened as a top-level document.  Additionally, SVG elements such as
 * <use>, <image>, and <feImage> can trigger out-of-band HTTP requests to
 * attacker-controlled servers (SSRF) or load external resources that
 * bypass the domain whitelist.
 *
 * Primary sanitizer: DOMPurify (isomorphic-dompurify) with SVG-safe config.
 * Regex fallback: applied after DOMPurify for defence-in-depth and to catch
 * any gap in the parser's coverage on non-browser environments.
 *
 * DOMPurify config:
 *   - USE_PROFILES.svg: allow standard SVG tags/attributes
 *   - FORBID_TAGS: drop <use>, <image>, <feImage> (SSRF vectors)
 *   - FORBID_ATTR: drop xlink:href and href from any surviving element
 *     (belt-and-suspenders — DOMPurify strips most anyway, but we need
 *     to block absolute-URL hrefs that bypass the profile whitelist)
 */
export function sanitizeSvg(svg: string): string {
	// --- Primary: DOMPurify (fail closed) ---
	// If DOMPurify itself errors we must NOT fall through with the original
	// payload guarded only by the regex pass — regex-only HTML filtering is
	// bypassable. Throwing makes the pipeline serve the default image instead.
	let result: string
	try {
		result = DOMPurify.sanitize(svg, {
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

	// --- Defence-in-depth: regex pass, looped until stable ---
	// A single pass can reassemble a payload (e.g. <scr<script>ipt>); repeat
	// until no replacement changes the string, bounded to avoid pathological
	// inputs.
	const MAX_PASSES = 5
	for (let pass = 0; pass < MAX_PASSES; pass++) {
		const before = result
		result = result
			// Drop <script>…</script> blocks (including CDATA content); the
			// closing tag may carry attributes or junk (</script foo>).
			.replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, '')
			// Drop orphaned/self-closing/opening script tags.
			.replace(/<script\b[^>]*>/gi, '')
			.replace(/<\/script\b[^>]*>/gi, '')
			// Drop <use …>, </use> — can load external symbol definitions.
			.replace(/<use\b[^>]*>/gi, '')
			.replace(/<\/use\b[^>]*>/gi, '')
			// Drop <image …>, </image> — raster-embed + SSRF vector.
			.replace(/<image\b[^>]*>/gi, '')
			.replace(/<\/image\b[^>]*>/gi, '')
			// Drop <feImage …>, </feImage> — filter-primitive SSRF.
			.replace(/<feImage\b[^>]*>/gi, '')
			.replace(/<\/feImage\b[^>]*>/gi, '')
			// Drop inline event handlers (onclick, onload, etc.).
			.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
			.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
			.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
			// Neutralize javascript:/vbscript:/data: URIs in href/xlink:href.
			.replace(/(xlink:href|href)\s*=\s*"\s*(?:javascript|vbscript|data):[^"]*"/gi, '$1="#"')
			.replace(/(xlink:href|href)\s*=\s*'\s*(?:javascript|vbscript|data):[^']*'/gi, '$1=\'#\'')
			// Remove href/xlink:href pointing to absolute URLs (http/https/protocol-relative).
			.replace(/(xlink:href|href)\s*=\s*"(?:https?:)?\/\/[^"]*"/gi, '$1="#"')
			.replace(/(xlink:href|href)\s*=\s*'(?:https?:)?\/\/[^']*'/gi, '$1=\'#\'')

		if (result === before) {
			break
		}
	}

	return result
}
