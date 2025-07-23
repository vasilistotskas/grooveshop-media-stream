import { ConfigModule } from '@microservice/Config/config.module'
import { MetricsController } from '@microservice/Metrics/controllers/metrics.controller'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Module } from '@nestjs/common'

@Module({
	imports: [ConfigModule],
	controllers: [MetricsController],
	providers: [MetricsService],
	exports: [MetricsService],
})
export class MetricsModule {}
