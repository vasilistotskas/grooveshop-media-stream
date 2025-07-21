import { createParamDecorator, ExecutionContext } from '@nestjs/common'
import { CorrelationService } from '../services/correlation.service'

/**
 * Decorator to inject correlation ID into controller methods
 */
export const CorrelationId = createParamDecorator(
	(data: unknown, ctx: ExecutionContext): string | null => {
		const correlationService = new CorrelationService()
		return correlationService.getCorrelationId()
	},
)

/**
 * Decorator to inject full request context into controller methods
 */
export const RequestContext = createParamDecorator(
	(data: unknown, ctx: ExecutionContext) => {
		const correlationService = new CorrelationService()
		return correlationService.getContext()
	},
)
