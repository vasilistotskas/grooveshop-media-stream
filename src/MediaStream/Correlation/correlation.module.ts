import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { CorrelationMiddleware } from './middleware/correlation.middleware'
import { TimingMiddleware } from './middleware/timing.middleware'
import { CorrelationService } from './services/correlation.service'

@Module({
	providers: [CorrelationService],
	exports: [CorrelationService],
})
export class CorrelationModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(CorrelationMiddleware, TimingMiddleware)
			.forRoutes('*')
	}
}
