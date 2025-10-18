import type { MiddlewareConsumer, NestModule } from '@nestjs/common'
import { ConfigModule } from '#microservice/Config/config.module'
import { Module } from '@nestjs/common'
import { MetricsController } from './controllers/metrics.controller.js'
import { MetricsMiddleware } from './middleware/metrics.middleware.js'
import { MetricsService } from './services/metrics.service.js'

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
