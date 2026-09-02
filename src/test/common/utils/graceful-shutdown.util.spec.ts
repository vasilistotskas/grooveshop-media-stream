import type { NextFunction, Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { isShuttingDown, shutdownMiddleware } from '#microservice/common/utils/graceful-shutdown.util'

function createMockResponse(): Response & { handlers: Record<string, () => void> } {
	const handlers: Record<string, () => void> = {}
	return {
		handlers,
		on: vi.fn((event: string, cb: () => void) => {
			handlers[event] = cb
		}),
		status: vi.fn().mockReturnThis(),
		json: vi.fn(),
	} as unknown as Response & { handlers: Record<string, () => void> }
}

describe('graceful-shutdown.util', () => {
	it('should not report shutdown before any signal is received', () => {
		expect(isShuttingDown()).toBe(false)
	})

	describe('shutdownMiddleware', () => {
		it('should pass requests through while running', () => {
			const res = createMockResponse()
			const next: NextFunction = vi.fn()

			shutdownMiddleware({} as Request, res, next)

			expect(next).toHaveBeenCalledOnce()
			expect(res.status).not.toHaveBeenCalled()
			expect(res.json).not.toHaveBeenCalled()
		})

		it('should register completion handlers for both finish and close', () => {
			const res = createMockResponse()

			shutdownMiddleware({} as Request, res, vi.fn())

			expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function))
			expect(res.on).toHaveBeenCalledWith('close', expect.any(Function))
			// Both fire for the same response; the second must be a harmless no-op.
			expect(() => {
				res.handlers.finish?.()
				res.handlers.close?.()
			}).not.toThrow()
		})
	})
})
