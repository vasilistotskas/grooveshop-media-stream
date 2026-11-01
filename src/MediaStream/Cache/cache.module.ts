import { Module } from '@nestjs/common'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import { ConfigModule } from '#microservice/Config/config.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { ValidationModule } from '#microservice/Validation/validation.module'
import { AdminCacheController } from './controllers/admin-cache.controller.js'
import { CacheHealthIndicator } from './indicators/cache-health.indicator.js'
import { RedisHealthIndicator } from './indicators/redis-health.indicator.js'
import { MemoryCacheLayer } from './layers/memory-cache.layer.js'
import { RedisCacheLayer } from './layers/redis-cache.layer.js'
import { MemoryCacheService } from './services/memory-cache.service.js'
import { MultiLayerCacheManager } from './services/multi-layer-cache.manager.js'
import { RedisCacheService } from './services/redis-cache.service.js'
import { RenditionCatalogueService } from './services/rendition-catalogue.service.js'
import { RenditionSizeService } from './services/rendition-size.service.js'
import { RenditionStoreService } from './services/rendition-store.service.js'
import { TenantCacheEpochs } from './services/tenant-cache-epochs.service.js'
import { TenantFlushService } from './services/tenant-flush.service.js'

@Module({
	imports: [
		ConfigModule,
		MetricsModule,
		ValidationModule,
	],
	controllers: [
		AdminCacheController,
	],
	providers: [
		MemoryCacheService,
		RedisCacheService,
		RenditionCatalogueService,
		RenditionSizeService,
		RenditionStoreService,
		MultiLayerCacheManager,
		TenantCacheEpochs,
		TenantFlushService,
		CacheHealthIndicator,
		RedisHealthIndicator,
		MemoryCacheLayer,
		RedisCacheLayer,
		InternalSecretGuard,
	],
	exports: [
		MemoryCacheService,
		RedisCacheService,
		RenditionCatalogueService,
		RenditionSizeService,
		RenditionStoreService,
		MultiLayerCacheManager,
		TenantCacheEpochs,
		CacheHealthIndicator,
		RedisHealthIndicator,
	],
})
export class CacheModule {}
