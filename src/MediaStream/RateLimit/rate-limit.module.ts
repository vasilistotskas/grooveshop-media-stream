import { ConfigModule } from '#microservice/Config/config.module'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { Module } from '@nestjs/common'
import { ThrottlerModule } from '@nestjs/throttler'
import { AdaptiveRateLimitGuard } from './guards/adaptive-rate-limit.guard'
import { RateLimitMetricsService } from './services/rate-limit-metrics.service'
import { RateLimitService } from './services/rate-limit.service'

@Module({
	imports: [
		ConfigModule,
		MetricsModule,
		ThrottlerModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (_configService: ConfigService) => ({
				throttlers: [
					{
						name: 'default',
						ttl: _configService.getOptional('rateLimit.default.windowMs', 60000),
						limit: _configService.getOptional('rateLimit.default.max', 500),
					},
					{
						name: 'image-processing',
						ttl: _configService.getOptional('rateLimit.imageProcessing.windowMs', 60000),
						limit: _configService.getOptional('rateLimit.imageProcessing.max', 300),
					},
				],
				skipIf: (context) => {
					const request = context.switchToHttp().getRequest()
					return request.url?.startsWith('/health')
				},
			}),
		}),
	],
	providers: [RateLimitService, AdaptiveRateLimitGuard, RateLimitMetricsService],
	exports: [RateLimitService, AdaptiveRateLimitGuard, RateLimitMetricsService],
})
export class RateLimitModule {}
