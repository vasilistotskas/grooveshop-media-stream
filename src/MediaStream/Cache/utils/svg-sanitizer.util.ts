import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { ProcessingTimeoutError, SvgSanitizationError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

/** Bytes of a fetched file to inspect for an SVG root; covers the XML declaration and DOCTYPE preamble. */
export const SVG_SNIFF_BYTES = 1024

/**
 * Old-generation heap of one sanitizer worker. jsdom needs roughly 100 MB
 * for a 5 000-element SVG; anything larger is rejected (fail closed) instead
 * of growing into the process heap.
 */
export const SVG_SANITIZER_HEAP_LIMIT_MB = 128

const XML_DECLARATION_RE = /^<\?xml[^?]*\?>\s*/i
const DOCTYPE_RE = /^<!DOCTYPE[^>]*>\s*/i
const SVG_NAMESPACE = 'xmlns="http://www.w3.org/2000/svg"'

// Same extension as this module: .ts when the source runs (tests), .js from build/dist.
const WORKER_URL = new URL(`./svg-sanitizer.worker${extname(fileURLToPath(import.meta.url))}`, import.meta.url)

/**
 * Whether the first bytes of a file are an SVG document: markup from the
 * first character, with an `<svg` root after any XML declaration / DOCTYPE
 * preamble, or carrying the SVG namespace (e.g. a comment before the root).
 *
 * The first-character check is what keeps rasters out. Every raster format
 * opens with a binary signature, but its metadata may embed SVG: a PNG with
 * C2PA Content Credentials (ChatGPT and other generators) carries its
 * `c2pa.icon` as `image/svg+xml` inside the first kilobyte, namespace
 * included. Taken for an SVG, the whole binary went through jsdom.
 */
export function isSvgHeader(header: string): boolean {
	const text = header.trimStart()
	if (!text.startsWith('<')) {
		return false
	}
	const stripped = text.replace(XML_DECLARATION_RE, '').replace(DOCTYPE_RE, '')
	return stripped.startsWith('<svg') || text.includes(SVG_NAMESPACE)
}

export interface SvgSanitizeLimits {
	/** Wall-clock budget in ms; 0 disables it. */
	timeoutMs: number
	heapLimitMb?: number
}

/**
 * Sanitize an SVG payload against XSS / SSRF vectors before it is either
 * served with `Content-Type: image/svg+xml` (the no-resize path, where the
 * bytes reach a browser and can execute script if opened top-level) or
 * rasterized by Sharp (the resize path).
 *
 * DOMPurify (isomorphic-dompurify, jsdom-backed) is the **authoritative**
 * sanitizer: a real DOM parser/serializer purpose-built for SVG/HTML XSS.
 * With the config in svg-sanitizer.worker.ts it structurally removes
 * `<script>`, `<use>`, `<image>`, `<feImage>`, every `on*` event handler, and
 * the `href`/`xlink:href` family (SSRF vectors) — including malformed and
 * reassembly payloads such as `<scr<script>ipt>` and `</script\t\n bar>`,
 * which it handles by parsing, not pattern-matching. A regex post-pass was
 * deliberately removed: regex HTML filtering is bypassable and strictly
 * weaker than the parser.
 *
 * It runs in a short-lived worker thread with a capped heap and a deadline.
 * jsdom's memory grows with the element count, not the byte count, so no
 * input-size check bounds it, and a synchronous parse on the main thread
 * would stall the event loop too. A worker that runs out of heap dies alone.
 *
 * Fail closed: if the worker errors or exceeds its heap, or if its output
 * somehow still contains a `<script` element, the SVG is rejected (the
 * pipeline then serves the default image) rather than served unsanitized.
 * @throws SvgSanitizationError when it fails closed
 * @throws ProcessingTimeoutError when the worker exceeds `timeoutMs`
 */
export async function sanitizeSvg(svg: string, { timeoutMs, heapLimitMb = SVG_SANITIZER_HEAP_LIMIT_MB }: SvgSanitizeLimits): Promise<string> {
	let sanitized: string
	try {
		sanitized = await runWorker(svg, timeoutMs, heapLimitMb)
	}
	catch (err: unknown) {
		if (err instanceof ProcessingTimeoutError) {
			throw err
		}
		CorrelatedLogger.error(
			`DOMPurify SVG sanitization failed — rejecting SVG (fail closed): ${errorMessage(err)}`,
			err instanceof Error ? err.stack : undefined,
			'SvgSanitizer',
		)
		throw new SvgSanitizationError('SVG sanitization unavailable', { cause: errorMessage(err) })
	}

	// Defence-in-depth tripwire: detection-and-reject, NOT stripping. DOMPurify's
	// FORBID_TAGS config guarantees no <script> survives; a residual one implies a
	// library regression or misconfiguration, so fail closed rather than serve it.
	if (sanitized.toLowerCase().includes('<script')) {
		CorrelatedLogger.error('Sanitized SVG unexpectedly still contains a <script element — rejecting', undefined, 'SvgSanitizer')
		throw new SvgSanitizationError('SVG sanitization incomplete')
	}

	return sanitized
}

function runWorker(svg: string, timeoutMs: number, heapLimitMb: number): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const worker = new Worker(WORKER_URL, {
			workerData: svg,
			resourceLimits: { maxOldGenerationSizeMb: heapLimitMb },
		})
		let timer: NodeJS.Timeout | null = null
		let settled = false
		const settle = (outcome: () => void): void => {
			if (settled) {
				return
			}
			settled = true
			if (timer) {
				clearTimeout(timer)
			}
			outcome()
		}

		if (timeoutMs > 0) {
			timer = setTimeout(() => {
				settle(() => reject(new ProcessingTimeoutError({ source: 'svg sanitizer', timeoutSeconds: timeoutMs / 1000 })))
				void worker.terminate()
			}, timeoutMs)
		}

		worker.once('message', (result: unknown) => {
			settle(() => typeof result === 'string' ? resolve(result) : reject(new Error('SVG sanitizer replied without markup')))
		})
		// Covers ERR_WORKER_OUT_OF_MEMORY and anything DOMPurify/jsdom throws.
		worker.once('error', (error: Error) => {
			settle(() => reject(error))
		})
		worker.once('exit', (code: number) => {
			settle(() => reject(new Error(`SVG sanitizer exited with code ${code} before replying`)))
		})
	})
}
