import sharp from 'sharp'
import { beforeAll, vi } from 'vitest'
import 'reflect-metadata'

// Ensure reflect-metadata is loaded before any tests
beforeAll(() => {
	// Disable Sharp cache in tests to prevent memory issues
	// Sharp's internal cache can cause memory leaks in test environments
	// where many images are processed in rapid succession
	sharp.cache(false)

	// Limit Sharp concurrency in tests to prevent resource exhaustion
	sharp.concurrency(1)
})

// Export vi for tests that need it explicitly
export { vi }
