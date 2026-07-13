import { describe, expect, it, vi } from 'vitest'
import {
	getActiveRequestCount,
	isShuttingDown,
	shutdownMiddleware,
	trackRequestEnd,
	trackRequestStart,
} from '#microservice/common/utils/graceful-shutdown.util'

function createMockResponse(): { on: ReturnType<typeof vi.fn>, status: ReturnType<typeof vi.fn>, json: ReturnType<typeof vi.fn>, handlers: Record<string, () => void> } {
	const handlers: Record<string, () => void> = {}
	const res = {
		handlers,
		on: vi.fn((event: string, cb: () => void) => {
			handlers[event] = cb
		}),
		status: vi.fn().mockReturnThis(),
		json: vi.fn(),
	}
	return res
}

describe('graceful-shutdown.util', () => {
	it('should not report shutdown before any signal is received', () => {
		expect(isShuttingDown()).toBe(false)
	})

	describe('request tracking', () => {
		it('should count request starts and ends', () => {
			const before = getActiveRequestCount()

			trackRequestStart()
			expect(getActiveRequestCount()).toBe(before + 1)

			trackRequestEnd()
			expect(getActiveRequestCount()).toBe(before)
		})

		it('should never go below zero', () => {
			const before = getActiveRequestCount()
			trackRequestEnd()
			trackRequestEnd()
			expect(getActiveRequestCount()).toBeGreaterThanOrEqual(0)
			expect(getActiveRequestCount()).toBeLessThanOrEqual(before)
		})

		it('should not double-count the same response via finish and close', () => {
			const before = getActiveRequestCount()
			const res = {}

			trackRequestStart()
			trackRequestEnd(res) // 'finish'
			trackRequestEnd(res) // 'close' for the same response — must be a no-op

			expect(getActiveRequestCount()).toBe(before)
		})
	})

	describe('shutdownMiddleware', () => {
		it('should pass requests through and register completion handlers while running', () => {
			const res = createMockResponse()
			const next = vi.fn()
			const before = getActiveRequestCount()

			shutdownMiddleware({}, res, next)

			expect(next).toHaveBeenCalled()
			expect(res.status).not.toHaveBeenCalled()
			expect(getActiveRequestCount()).toBe(before + 1)

			// Both finish and close fire for the same response — only one decrement
			res.handlers.finish?.()
			res.handlers.close?.()
			expect(getActiveRequestCount()).toBe(before)
		})
	})
})
