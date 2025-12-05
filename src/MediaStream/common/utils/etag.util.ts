/**
 * ETag generation utility for HTTP caching
 */

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

/**
 * Generate a strong ETag from content
 */
export function generateETag(content: Buffer | string): string {
	const hash = createHash('md5')
	hash.update(content)
	return `"${hash.digest('hex')}"`
}

/**
 * Generate a weak ETag from metadata (faster, suitable for most cases)
 */
export function generateWeakETag(
	size: number | string,
	dateCreated: number,
	format?: string,
): string {
	const components = [size.toString(), dateCreated.toString()]
	if (format) {
		components.push(format)
	}
	return `W/"${components.join('-')}"`
}

/**
 * Check if the request has a matching ETag (for conditional requests)
 */
export function checkETagMatch(
	requestETag: string | undefined,
	currentETag: string,
): boolean {
	if (!requestETag) {
		return false
	}

	// Handle multiple ETags in If-None-Match
	const requestETags = requestETag.split(',').map(tag => tag.trim())

	// Check for wildcard
	if (requestETags.includes('*')) {
		return true
	}

	// Normalize ETags for comparison (remove weak prefix for comparison)
	const normalizedCurrent = normalizeETag(currentETag)

	return requestETags.some((tag) => {
		const normalizedRequest = normalizeETag(tag)
		return normalizedRequest === normalizedCurrent
	})
}

/**
 * Normalize ETag by removing weak prefix
 */
function normalizeETag(etag: string): string {
	return etag.replace(/^W\//, '').replace(/^"|"$/g, '')
}

/**
 * Check if resource was modified since the given date
 */
export function checkIfModifiedSince(
	ifModifiedSince: string | undefined,
	lastModified: Date | number,
): boolean {
	if (!ifModifiedSince) {
		return true // No header means always modified
	}

	try {
		const requestDate = new Date(ifModifiedSince).getTime()
		const resourceDate = typeof lastModified === 'number'
			? lastModified
			: lastModified.getTime()

		// Resource is modified if its date is newer than the request date
		return resourceDate > requestDate
	}
	catch {
		return true // Invalid date means treat as modified
	}
}

/**
 * Generate Last-Modified header value
 */
export function formatLastModified(date: Date | number): string {
	const d = typeof date === 'number' ? new Date(date) : date
	return d.toUTCString()
}
