import { Module } from '@nestjs/common'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import { ConfigModule } from '#microservice/Config/config.module'
import { MetricsController } from './controllers/metrics.controller.js'
import { MetricsMiddleware } from './middleware/metrics.middleware.js'
import { MetricsService } from './services/metrics.service.js'

@Module({
	imports: [ConfigModule],
	controllers: [MetricsController],
	providers: [MetricsService, MetricsMiddleware, InternalSecretGuard],
	exports: [MetricsService],
})
export class MetricsModule {}
