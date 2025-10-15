import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import { CorrelationMiddleware } from '@microservice/Correlation/middleware/correlation.middleware'
import { TimingMiddleware } from '@microservice/Correlation/middleware/timing.middleware'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { Module } from '@nestjs/common'

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
