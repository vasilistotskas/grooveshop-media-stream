import type { ExecutionContext } from '@nestjs/common'
import { createParamDecorator } from '@nestjs/common'
import { CorrelationService } from '../services/correlation.service'

/**
 * Decorator to inject correlation ID into controller methods
 */
export const CorrelationId = createParamDecorator(
	(_data: unknown, _ctx: ExecutionContext): string | null => {
		const correlationService = new CorrelationService()
		return correlationService.getCorrelationId()
	},
)

/**
 * Decorator to inject full request context into controller methods
 */
export const RequestContext = createParamDecorator(
	(_data: unknown, _ctx: ExecutionContext) => {
		const correlationService = new CorrelationService()
		return correlationService.getContext()
	},
)
