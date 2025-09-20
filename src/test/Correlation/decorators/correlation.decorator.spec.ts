// Import decorators after mocking
import { CorrelationId, RequestContext } from '@microservice/Correlation/decorators/correlation.decorator'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'

import { ExecutionContext } from '@nestjs/common'

// Mock createParamDecorator to return the factory function directly
jest.mock('@nestjs/common', () => ({
	...jest.requireActual('@nestjs/common'),
	createParamDecorator: (factory: any) => factory,
}))

// Mock the CorrelationService
jest.mock('@microservice/Correlation/services/correlation.service')

describe('correlation Decorators', () => {
	let mockCorrelationService: jest.Mocked<CorrelationService>
	let mockExecutionContext: jest.Mocked<ExecutionContext>

	beforeEach(() => {
		// Create mock execution context
		mockExecutionContext = {
			switchToHttp: jest.fn(),
			getArgs: jest.fn(),
			getArgByIndex: jest.fn(),
			switchToRpc: jest.fn(),
			switchToWs: jest.fn(),
			getType: jest.fn(),
			getClass: jest.fn(),
			getHandler: jest.fn(),
		} as any

		// Mock CorrelationService constructor and methods
		mockCorrelationService = {
			getCorrelationId: jest.fn(),
			getContext: jest.fn(),
			setCorrelationId: jest.fn(),
			generateCorrelationId: jest.fn(),
		} as any

		;(CorrelationService as jest.MockedClass<typeof CorrelationService>).mockImplementation(
			() => mockCorrelationService,
		)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	describe('correlationId decorator', () => {
		it('should return correlation ID from service', () => {
			const expectedCorrelationId = 'test-correlation-id-123'
			mockCorrelationService.getCorrelationId.mockReturnValue(expectedCorrelationId)

			// Execute the decorator function directly
			const result = (CorrelationId as any)(undefined, mockExecutionContext)

			expect(result).toBe(expectedCorrelationId)
			expect(CorrelationService).toHaveBeenCalledTimes(1)
			expect(mockCorrelationService.getCorrelationId).toHaveBeenCalledTimes(1)
		})

		it('should return null when no correlation ID exists', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue(null)

			const result = (CorrelationId as any)(undefined, mockExecutionContext)

			expect(result).toBeNull()
			expect(mockCorrelationService.getCorrelationId).toHaveBeenCalledTimes(1)
		})

		it('should create new CorrelationService instance each time', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-id')

			// Call multiple times
			;(CorrelationId as any)(undefined, mockExecutionContext)
			;(CorrelationId as any)(undefined, mockExecutionContext)

			expect(CorrelationService).toHaveBeenCalledTimes(2)
		})
	})

	describe('requestContext decorator', () => {
		it('should return request context from service', () => {
			const expectedContext = {
				correlationId: 'test-correlation-id',
				timestamp: Date.now(),
				clientIp: '127.0.0.1',
				method: 'GET',
				url: '/test',
				startTime: BigInt(Date.now()),
			}
			mockCorrelationService.getContext.mockReturnValue(expectedContext)

			const result = (RequestContext as any)(undefined, mockExecutionContext)

			expect(result).toBe(expectedContext)
			expect(CorrelationService).toHaveBeenCalledTimes(1)
			expect(mockCorrelationService.getContext).toHaveBeenCalledTimes(1)
		})

		it('should return undefined when no context exists', () => {
			mockCorrelationService.getContext.mockReturnValue(undefined as any)

			const result = (RequestContext as any)(undefined, mockExecutionContext)

			expect(result).toBeUndefined()
			expect(mockCorrelationService.getContext).toHaveBeenCalledTimes(1)
		})

		it('should create new CorrelationService instance each time', () => {
			mockCorrelationService.getContext.mockReturnValue({
				correlationId: 'test',
				timestamp: Date.now(),
				clientIp: '127.0.0.1',
				method: 'GET',
				url: '/test',
				startTime: BigInt(Date.now()),
			})

			// Call multiple times
			;(RequestContext as any)(undefined, mockExecutionContext)
			;(RequestContext as any)(undefined, mockExecutionContext)

			expect(CorrelationService).toHaveBeenCalledTimes(2)
		})
	})

	describe('decorator integration', () => {
		it('should work with different execution contexts', () => {
			const httpContext = { ...mockExecutionContext }
			const rpcContext = { ...mockExecutionContext }

			mockCorrelationService.getCorrelationId.mockReturnValue('http-id')

			const httpResult = (CorrelationId as any)(undefined, httpContext)
			const rpcResult = (CorrelationId as any)(undefined, rpcContext)

			expect(httpResult).toBe('http-id')
			expect(rpcResult).toBe('http-id')
			expect(CorrelationService).toHaveBeenCalledTimes(2)
		})

		it('should ignore data parameter', () => {
			mockCorrelationService.getCorrelationId.mockReturnValue('test-id')

			// Pass different data values
			const result1 = (CorrelationId as any)('some-data', mockExecutionContext)
			const result2 = (CorrelationId as any)({ key: 'value' }, mockExecutionContext)
			const result3 = (CorrelationId as any)(null, mockExecutionContext)

			expect(result1).toBe('test-id')
			expect(result2).toBe('test-id')
			expect(result3).toBe('test-id')
		})
	})

	describe('error handling', () => {
		it('should handle CorrelationService errors gracefully', () => {
			mockCorrelationService.getCorrelationId.mockImplementation(() => {
				throw new Error('Service error')
			})

			expect(() => (CorrelationId as any)(undefined, mockExecutionContext)).toThrow('Service error')
		})

		it('should handle context service errors gracefully', () => {
			mockCorrelationService.getContext.mockImplementation(() => {
				throw new Error('Context error')
			})

			expect(() => (RequestContext as any)(undefined, mockExecutionContext)).toThrow('Context error')
		})
	})
})
