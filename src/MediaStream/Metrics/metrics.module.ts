import { Module } from '@nestjs/common'
import { ConfigModule } from '#microservice/Config/config.module'
import { MetricsController } from './controllers/metrics.controller.js'
import { MetricsTokenGuard } from './guards/metrics-token.guard.js'
import { MetricsMiddleware } from './middleware/metrics.middleware.js'
import { MetricsService } from './services/metrics.service.js'

@Module({
	imports: [ConfigModule],
	controllers: [MetricsController],
	providers: [MetricsService, MetricsMiddleware, MetricsTokenGuard],
	exports: [MetricsService],
})
export class MetricsModule {}
