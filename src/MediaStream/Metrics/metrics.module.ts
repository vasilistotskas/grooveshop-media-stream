import { ConfigModule } from '@microservice/Config/config.module'
import { MetricsController } from '@microservice/Metrics/controllers/metrics.controller'
import { MetricsMiddleware } from '@microservice/Metrics/middleware/metrics.middleware'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'

@Module({
	imports: [ConfigModule],
	controllers: [MetricsController],
	providers: [MetricsService, MetricsMiddleware],
	exports: [MetricsService],
})
export class MetricsModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		consumer.apply(MetricsMiddleware).forRoutes('*')
	}
}
