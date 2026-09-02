const UNITS = ['B', 'KB', 'MB', 'GB'] as const

/** Human-readable size with one decimal, e.g. `1.5 MB`. */
export function formatBytes(bytes: number): string {
	let size = bytes
	let unitIndex = 0

	while (size >= 1024 && unitIndex < UNITS.length - 1) {
		size /= 1024
		unitIndex++
	}

	return `${size.toFixed(1)} ${UNITS[unitIndex]}`
}

/** Whole megabytes, for health payloads. */
export function bytesToMb(bytes: number): number {
	return Math.round(bytes / (1024 * 1024))
}
