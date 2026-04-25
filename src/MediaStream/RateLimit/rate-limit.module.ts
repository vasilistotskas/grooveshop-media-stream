import { CacheModule } from '#microservice/Cache/cache.module'
import { ConfigModule } from '#microservice/Config/config.module'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { Module } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { AdaptiveRateLimitGuard } from './guards/adaptive-rate-limit.guard.js'
import { RateLimitService } from './services/rate-limit.service.js'

@Module({
	imports: [
		ConfigModule,
		MetricsModule,
		CacheModule,
		// ThrottlerModule registers THROTTLER_OPTIONS and ThrottlerStorage providers.
		// AdaptiveRateLimitGuard extends ThrottlerGuard and injects both tokens.
		// The ThrottlerStorageService (in-memory) acts as a per-process secondary
		// safety net; the primary distributed counter is in RateLimitService (Redis).
		// To switch to Redis-backed Throttler storage, install
		// nestjs-throttler-storage-redis and pass it as the `storage:` option here.
		ThrottlerModule.forRootAsync({
			imports: [ConfigModule],
			inject: [ConfigService],
			useFactory: (_configService: ConfigService) => ({
				throttlers: [
					{
						name: 'default',
						ttl: _configService.getOptional('rateLimit.default.windowMs', 60000),
						limit: _configService.getOptional('rateLimit.default.max', 100),
					},
					{
						name: 'image-processing',
						ttl: _configService.getOptional('rateLimit.imageProcessing.windowMs', 60000),
						limit: _configService.getOptional('rateLimit.imageProcessing.max', 50),
					},
				],
				// Health endpoints are also short-circuited by shouldSkip() in the
				// guard, but setting skipIf here avoids unnecessary ThrottlerStorage
				// increments for probes that reach the super.canActivate() path.
				skipIf: (context) => {
					const request = context.switchToHttp().getRequest()
					return request.url?.startsWith('/health')
				},
			}),
		}),
	],
	// Reflector must be listed here so NestJS injects it into AdaptiveRateLimitGuard
	// via the ThrottlerGuard base-class constructor.
	providers: [Reflector, RateLimitService, AdaptiveRateLimitGuard],
	exports: [RateLimitService, AdaptiveRateLimitGuard],
})
export class RateLimitModule {}
