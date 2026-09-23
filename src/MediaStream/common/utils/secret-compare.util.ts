import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

/**
 * Constant-time comparison so response timing cannot leak a secret's
 * contents. `timingSafeEqual` requires equal-length buffers, so a length
 * mismatch is rejected upfront — a length-only leak, never a content leak.
 */
export function secretsMatch(provided: string, expected: string): boolean {
	const providedBuffer = Buffer.from(provided)
	const expectedBuffer = Buffer.from(expected)

	if (providedBuffer.length !== expectedBuffer.length) {
		return false
	}

	return timingSafeEqual(providedBuffer, expectedBuffer)
}
