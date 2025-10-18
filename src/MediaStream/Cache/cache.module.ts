import { ConfigModule } from '#microservice/Config/config.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { CacheHealthIndicator } from './indicators/cache-health.indicator.js'
import { RedisHealthIndicator } from './indicators/redis-health.indicator.js'
import { FileCacheLayer } from './layers/file-cache.layer.js'
import { MemoryCacheLayer } from './layers/memory-cache.layer.js'
import { RedisCacheLayer } from './layers/redis-cache.layer.js'
import { CacheWarmingService } from './services/cache-warming.service.js'
import { MemoryCacheService } from './services/memory-cache.service.js'
import { MultiLayerCacheManager } from './services/multi-layer-cache.manager.js'
import { RedisCacheService } from './services/redis-cache.service.js'
import { DefaultCacheKeyStrategy } from './strategies/cache-key.strategy.js'

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
