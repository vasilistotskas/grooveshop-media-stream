import * as process from 'node:process'
import { INestApplication } from '@nestjs/common'

/**
 * Utility to help with graceful app shutdown in tests
 */
export async function gracefulShutdown(app: INestApplication, delay = 100): Promise<void> {
	if (!app)
		return

	// Add delay to allow pending requests to complete
	await new Promise(resolve => setTimeout(resolve, delay))

	try {
		await app.close()
	}
	catch (error) {
		console.warn('Error during app shutdown:', error)
	}
}

/**
 * Utility to create staggered requests to reduce server load
 */
export function createStaggeredRequests<T>(
	requestFactory: (index: number) => Promise<T>,
	count: number,
	staggerMs = 10,
): Promise<T>[] {
	return Array.from({ length: count }, (_, i) =>
		new Promise<T>((resolve) => {
			setTimeout(() => {
				resolve(requestFactory(i))
			}, i * staggerMs)
		}))
}

/**
 * Get CI-friendly request count
 */
export function getCIFriendlyCount(normalCount: number, ciCount?: number): number {
	return process.env.CI ? (ciCount ?? Math.ceil(normalCount / 2)) : normalCount
}
