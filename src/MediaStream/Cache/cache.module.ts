import { ConfigModule } from '@microservice/Config/config.module'
import { MetricsModule } from '@microservice/Metrics/metrics.module'
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { CacheHealthIndicator } from './indicators/cache-health.indicator'
import { RedisHealthIndicator } from './indicators/redis-health.indicator'
import { CacheWarmingService } from './services/cache-warming.service'
import { MemoryCacheService } from './services/memory-cache.service'
import { RedisCacheService } from './services/redis-cache.service'

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
