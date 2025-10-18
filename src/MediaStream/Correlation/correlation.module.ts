import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { CorrelationMiddleware } from './middleware/correlation.middleware.js'
import { TimingMiddleware } from './middleware/timing.middleware.js'
import { CorrelationService } from './services/correlation.service.js'

@Module({
	providers: [CorrelationService],
	exports: [CorrelationService],
})
export class CorrelationModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer
			.apply(CorrelationMiddleware, TimingMiddleware)
			.forRoutes('*')
	}
}
