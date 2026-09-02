/**
 * Message of a caught value. Non-Error rejections (strings, undefined) are
 * stringified instead of producing the literal "undefined" in a log line.
 */
export function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
