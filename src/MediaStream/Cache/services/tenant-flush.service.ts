import type { OnModuleInit } from '@nestjs/common'
import type { RedisConfig } from '#microservice/Config/interfaces/app-config.interface'
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { TENANT_SCHEMA_PATTERN } from '#microservice/common/constants/tenant.constant'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import { MemoryCacheLayer } from '../layers/memory-cache.layer.js'
import { cacheKey, imageNamespace } from '../utils/cache-namespace.util.js'
import { MultiLayerCacheManager } from './multi-layer-cache.manager.js'
import { RedisCacheService } from './redis-cache.service.js'

const TENANT_FLUSH_CHANNEL = 'mediastream:tenant-flush'

interface TenantFlushMessage {
	tenantSchema: string
	/** The replica that took the request; it has already flushed itself. */
	origin: string
}

export interface TenantFlushResult {
	namespace: string
	filesRemoved: number
	diskErrors: string[]
	/** Subscribers that received the broadcast, this replica included; 0 when Redis is unreachable. */
	broadcastReceivers: number
}

function isTenantFlushMessage(value: unknown): value is TenantFlushMessage {
	if (typeof value !== 'object' || value === null) {
		return false
	}
	const { tenantSchema, origin } = value as Record<string, unknown>
	return typeof tenantSchema === 'string' && typeof origin === 'string'
}

/**
 * Per-tenant cache flush across every replica.
 *
 * Redis is shared, but each replica also holds a private memory tier and an
 * on-disk tier that a request to one replica cannot reach. The replica that
 * takes the request therefore flushes itself completely (memory, Redis, disk)
 * and then broadcasts the tenant over Redis pub/sub; every other replica drops
 * its own memory and disk entries for that tenant. Redis is cleared once, by
 * the origin.
 */
@Injectable()
export class TenantFlushService implements OnModuleInit {
	private readonly instanceId = randomUUID()
	private readonly channel: string

	constructor(
		configService: ConfigService,
		private readonly redisCacheService: RedisCacheService,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly memoryCacheLayer: MemoryCacheLayer,
		private readonly storageCleanupService: StorageCleanupService,
	) {
		// Pub/sub channels are server-wide, not per database: scope the channel to
		// the configured database so environments sharing a server stay apart.
		this.channel = `${TENANT_FLUSH_CHANNEL}:${configService.get<RedisConfig>('cache.redis').db}`
	}

	onModuleInit(): void {
		this.redisCacheService.subscribe(this.channel, (message) => {
			this.handleBroadcast(message).catch((error: unknown) => {
				CorrelatedLogger.error(`Tenant flush broadcast failed: ${errorMessage(error)}`, undefined, TenantFlushService.name)
			})
		})
	}

	async flushTenant(tenantSchema: string): Promise<TenantFlushResult> {
		const namespace = imageNamespace(tenantSchema)
		CorrelatedLogger.log(`Flushing cache for tenant namespace: ${namespace}`, TenantFlushService.name)

		await this.cacheManager.invalidateNamespace(namespace)
		const disk = await this.storageCleanupService.removeTenantFiles(tenantSchema)
		const broadcastReceivers = await this.broadcast(tenantSchema)

		CorrelatedLogger.log(
			`Cache flush complete for ${namespace}: ${disk.filesRemoved} file pair(s) removed${disk.errors.length ? `, ${disk.errors.length} error(s)` : ''}, broadcast reached ${broadcastReceivers} subscriber(s)`,
			TenantFlushService.name,
		)

		return { namespace, filesRemoved: disk.filesRemoved, diskErrors: disk.errors, broadcastReceivers }
	}

	/** A failed broadcast leaves the other replicas unflushed, which the result reports as zero receivers. */
	private async broadcast(tenantSchema: string): Promise<number> {
		const message: TenantFlushMessage = { tenantSchema, origin: this.instanceId }
		try {
			return await this.redisCacheService.publish(this.channel, JSON.stringify(message))
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Tenant flush broadcast failed, other replicas keep their cache: ${errorMessage(error)}`, TenantFlushService.name)
			return 0
		}
	}

	private async handleBroadcast(raw: string): Promise<void> {
		let message: unknown
		try {
			message = JSON.parse(raw)
		}
		catch {
			CorrelatedLogger.warn('Ignoring tenant flush broadcast with an unparsable payload', TenantFlushService.name)
			return
		}

		if (!isTenantFlushMessage(message) || !TENANT_SCHEMA_PATTERN.test(message.tenantSchema)) {
			CorrelatedLogger.warn('Ignoring tenant flush broadcast with an invalid payload', TenantFlushService.name)
			return
		}

		if (message.origin === this.instanceId) {
			return
		}

		const namespace = imageNamespace(message.tenantSchema)
		const memoryRemoved = await this.memoryCacheLayer.deleteByPrefix(cacheKey(namespace, ''))
		const disk = await this.storageCleanupService.removeTenantFiles(message.tenantSchema)
		CorrelatedLogger.log(
			`Peer flush for ${namespace}: ${memoryRemoved} memory key(s) and ${disk.filesRemoved} file pair(s) removed${disk.errors.length ? `, ${disk.errors.length} error(s)` : ''}`,
			TenantFlushService.name,
		)
	}
}
