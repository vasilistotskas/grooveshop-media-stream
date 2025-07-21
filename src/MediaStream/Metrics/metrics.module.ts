import { ConfigModule } from '@microservice/Config/config.module'
import { Module } from '@nestjs/common'
import { MetricsController } from './controllers/metrics.controller'
import { MetricsService } from './services/metrics.service'

@Module({
	imports: [ConfigModule],
	controllers: [MetricsController],
	providers: [MetricsService],
	exports: [MetricsService],
})
export class MetricsModule {}
