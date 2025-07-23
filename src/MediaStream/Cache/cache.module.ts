import { CacheHealthIndicator } from '@microservice/Cache/indicators/cache-health.indicator'
import { RedisHealthIndicator } from '@microservice/Cache/indicators/redis-health.indicator'
import { CacheWarmingService } from '@microservice/Cache/services/cache-warming.service'
import { MemoryCacheService } from '@microservice/Cache/services/memory-cache.service'
import { RedisCacheService } from '@microservice/Cache/services/redis-cache.service'
import { ConfigModule } from '@microservice/Config/config.module'
import { MetricsModule } from '@microservice/Metrics/metrics.module'
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'

@Module({
	imports: [
		ScheduleModule.forRoot(),
		ConfigModule,
		MetricsModule,
	],
	providers: [
		MemoryCacheService,
		RedisCacheService,
		CacheWarmingService,
		CacheHealthIndicator,
		RedisHealthIndicator,
	],
	exports: [
		MemoryCacheService,
		RedisCacheService,
		CacheWarmingService,
		CacheHealthIndicator,
		RedisHealthIndicator,
	],
})
export class CacheModule {}
