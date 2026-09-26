/**
 * Worker-thread entry for `sanitizeSvg()` (svg-sanitizer.util.ts): receives
 * the SVG markup as `workerData`, posts back the sanitised markup.
 *
 * DOMPurify runs on jsdom, whose DOM costs 5-25 KB of JS heap per element:
 * 20 000 `<g/>` (80 KB of markup) take ~150 MB, and the shared jsdom window
 * of isomorphic-dompurify keeps growing across calls
 * (kkomelin/isomorphic-dompurify#368). In the main thread one large SVG
 * exhausted the 512 MB heap and killed the pod. Here the caller caps the
 * worker's heap and runtime, and the whole heap is discarded when it exits.
 *
 * Loaded by URL at runtime, from source in tests (Node strips the types) and
 * from build/dist in production, so it imports packages only — no path aliases.
 */
import { parentPort, workerData } from 'node:worker_threads'
import DOMPurify from 'isomorphic-dompurify'

const sanitized = DOMPurify.sanitize(workerData as string, {
	USE_PROFILES: { svg: true, svgFilters: true },
	FORBID_TAGS: ['script', 'use', 'image', 'feimage'],
	FORBID_ATTR: ['xlink:href', 'href', 'action', 'formaction'],
	// Keep SVG structure intact; don't wrap in <div>
	WHOLE_DOCUMENT: false,
	RETURN_DOM: false,
})

parentPort?.postMessage(sanitized)
