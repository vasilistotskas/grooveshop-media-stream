/**
 * TinyMCE-authored URLs arrive double-encoded (`%25CF%2584`), so one
 * `decodeURIComponent` pass is not enough. Three passes cover every shape
 * seen in production; a value that never stabilises keeps its remaining `%`.
 */
const MAX_DECODE_PASSES = 3

/**
 * Percent-decode until the value is stable. Throws `URIError` on malformed
 * encoding — callers decide whether that is a 400 or a fallback.
 */
export function decodePathFully(path: string): string {
	let current = path
	for (let i = 0; i < MAX_DECODE_PASSES && current.includes('%'); i++) {
		const decoded = decodeURIComponent(current)
		if (decoded === current) {
			break
		}
		current = decoded
	}
	return current
}
