import type { RequestContext } from '@microservice/Correlation/interfaces/correlation.interface'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('correlationService', () => {
	let service: CorrelationService

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [CorrelationService],
		}).compile()

		service = module.get<CorrelationService>(CorrelationService)
	})

	afterEach(() => {
		service.clearContext()
	})

	describe('generateCorrelationId', () => {
		it('should generate a valid UUID v4', () => {
			const correlationId = service.generateCorrelationId()

			expect(correlationId).toBeDefined()
			expect(typeof correlationId).toBe('string')
			expect(correlationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
		})

		it('should generate unique correlation IDs', () => {
			const id1 = service.generateCorrelationId()
			const id2 = service.generateCorrelationId()

			expect(id1).not.toBe(id2)
		})
	})

	describe('context management', () => {
		const mockContext: RequestContext = {
			correlationId: 'test-correlation-id',
			timestamp: Date.now(),
			clientIp: '127.0.0.1',
			userAgent: 'test-agent',
			method: 'GET',
			url: '/test',
			startTime: BigInt(Date.now() * 1000000),
		}

		it('should set and get context', () => {
			service.setContext(mockContext)
			const retrievedContext = service.getContext()

			expect(retrievedContext).toEqual(mockContext)
		})

		it('should return null when no context is set', () => {
			const context = service.getContext()
			expect(context).toBeNull()
		})

		it('should get correlation ID from context', () => {
			service.setContext(mockContext)
			const correlationId = service.getCorrelationId()

			expect(correlationId).toBe(mockContext.correlationId)
		})

		it('should return null correlation ID when no context', () => {
			const correlationId = service.getCorrelationId()
			expect(correlationId).toBeNull()
		})

		it('should update context with partial data', () => {
			service.setContext(mockContext)

			const updates = { userId: 'user123' }
			service.updateContext(updates)

			const updatedContext = service.getContext()
			expect(updatedContext).toEqual({ ...mockContext, ...updates })
		})

		it('should not update context when no context exists', () => {
			const updates = { userId: 'user123' }
			service.updateContext(updates)

			const context = service.getContext()
			expect(context).toBeNull()
		})
	})

	describe('runWithContext', () => {
		const mockContext: RequestContext = {
			correlationId: 'test-correlation-id',
			timestamp: Date.now(),
			clientIp: '127.0.0.1',
			method: 'GET',
			url: '/test',
			startTime: BigInt(Date.now() * 1000000),
		}

		it('should run function within correlation context', () => {
			let contextInFunction: RequestContext | null = null

			const result = service.runWithContext(mockContext, () => {
				contextInFunction = service.getContext()
				return 'test-result'
			})

			expect(result).toBe('test-result')
			expect(contextInFunction).toEqual(mockContext)
		})

		it('should isolate context within function scope', () => {
			const result = service.runWithContext(mockContext, () => {
				return service.getCorrelationId()
			})

			expect(result).toBe(mockContext.correlationId)
			expect(service.getContext()).toBeNull()
		})

		it('should handle async functions', async () => {
			const asyncFunction = async () => {
				await new Promise(resolve => setTimeout(resolve, 10))
				return service.getCorrelationId()
			}

			const result = service.runWithContext(mockContext, asyncFunction)
			expect(await result).toBe(mockContext.correlationId)
		})
	})

	describe('clearContext', () => {
		it('should clear existing context', () => {
			const mockContext: RequestContext = {
				correlationId: 'test-correlation-id',
				timestamp: Date.now(),
				clientIp: '127.0.0.1',
				method: 'GET',
				url: '/test',
				startTime: BigInt(Date.now() * 1000000),
			}

			service.setContext(mockContext)
			expect(service.getContext()).toEqual(mockContext)

			service.clearContext()
			expect(service.getContext()).toBeNull()
		})
	})
})
