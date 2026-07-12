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
	let result = svg

	// --- Primary: DOMPurify ---
	try {
		result = DOMPurify.sanitize(result, {
			USE_PROFILES: { svg: true, svgFilters: true },
			FORBID_TAGS: ['script', 'use', 'image', 'feimage'],
			FORBID_ATTR: ['xlink:href', 'href', 'action', 'formaction'],
			// Keep SVG structure intact; don't wrap in <div>
			WHOLE_DOCUMENT: false,
			RETURN_DOM: false,
		}) as string
	}
	catch (err: unknown) {
		CorrelatedLogger.warn(
			`DOMPurify SVG sanitization failed, falling back to regex: ${(err as Error).message}`,
			'SvgSanitizer',
		)
		// result stays as the original svg — regex pass below still runs
	}

	// --- Fallback / defence-in-depth: regex pass ---
	result = result
		// Drop <script>…</script> blocks (including CDATA content).
		.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
		// Drop self-closing <script/> tags.
		.replace(/<script\b[^>]*\/>/gi, '')
		// Drop <use …>, </use> — can load external symbol definitions.
		.replace(/<use\b[^>]*>/gi, '')
		.replace(/<\/use\s*>/gi, '')
		// Drop <image …>, </image> — raster-embed + SSRF vector.
		.replace(/<image\b[^>]*>/gi, '')
		.replace(/<\/image\s*>/gi, '')
		// Drop <feImage …>, </feImage> — filter-primitive SSRF.
		.replace(/<feImage\b[^>]*>/gi, '')
		.replace(/<\/feImage\s*>/gi, '')
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

	return result
}
