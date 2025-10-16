import { CacheHealthIndicator } from '#microservice/Cache/indicators/cache-health.indicator'
import { RedisHealthIndicator } from '#microservice/Cache/indicators/redis-health.indicator'
import { FileCacheLayer } from '#microservice/Cache/layers/file-cache.layer'
import { MemoryCacheLayer } from '#microservice/Cache/layers/memory-cache.layer'
import { RedisCacheLayer } from '#microservice/Cache/layers/redis-cache.layer'
import { CacheWarmingService } from '#microservice/Cache/services/cache-warming.service'
import { MemoryCacheService } from '#microservice/Cache/services/memory-cache.service'
import { MultiLayerCacheManager } from '#microservice/Cache/services/multi-layer-cache.manager'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { DefaultCacheKeyStrategy } from '#microservice/Cache/strategies/cache-key.strategy'
import { ConfigModule } from '#microservice/Config/config.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
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
		MultiLayerCacheManager,
		CacheHealthIndicator,
		RedisHealthIndicator,
		DefaultCacheKeyStrategy,
		MemoryCacheLayer,
		RedisCacheLayer,
		FileCacheLayer,
	],
	exports: [
		MemoryCacheService,
		RedisCacheService,
		CacheWarmingService,
		MultiLayerCacheManager,
		CacheHealthIndicator,
		RedisHealthIndicator,
		DefaultCacheKeyStrategy,
		MemoryCacheLayer,
		RedisCacheLayer,
		FileCacheLayer,
	],
})
export class CacheModule {}
