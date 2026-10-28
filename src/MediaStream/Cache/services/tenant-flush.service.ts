import type { OnModuleInit } from '@nestjs/common'
import type { RedisConfig } from '#microservice/Config/interfaces/app-config.interface'
import type { CacheLayerName } from '../interfaces/cache-layer.interface.js'
import { randomUUID } from 'node:crypto'
import { Injectable } from '@nestjs/common'
import { TENANT_SCHEMA_PATTERN } from '#microservice/common/constants/tenant.constant'
import { TenantFlushIncompleteError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { StorageCleanupService } from '#microservice/Storage/services/storage-cleanup.service'
import { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'
import { imageNamespace } from '../utils/cache-namespace.util.js'
import { MultiLayerCacheManager } from './multi-layer-cache.manager.js'
import { RedisCacheService } from './redis-cache.service.js'
import { TenantCacheEpochs } from './tenant-cache-epochs.service.js'

const TENANT_FLUSH_CHANNEL = 'mediastream:tenant-flush'

/**
 * Layered tiers in the order they are cleared: a tier is cleared only after
 * every tier it can be refilled from (memory is backfilled from Redis, both
 * from disk), so a request arriving mid-flush cannot copy a stale entry into a
 * tier that is already done. The disk tier goes first, before these.
 */
const LAYERS_BOTTOM_UP: readonly CacheLayerName[] = ['redis', 'memory']

interface TenantFlushMessage {
	tenantSchema: string
	/** The replica that took the request; it has already flushed itself. */
	origin: string
}

interface LocalClear {
	filesRemoved: number
	diskErrors: string[]
	/** Tiers that could not be cleared, with the reason. */
	failures: string[]
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
 * takes the request clears itself and then broadcasts the tenant over Redis
 * pub/sub; every other replica clears itself the same way.
 *
 * Clearing a replica starts by re-reading Django's tenant feed: Django sends
 * the flush when a store is suspended or reactivated, so the replica refuses
 * or serves the store's images from then on, not from its next poll, and a
 * request arriving after the clear cannot refill a suspended store's tiers.
 *
 * Then disk, then Redis, then memory (bottom-up, see
 * LAYERS_BOTTOM_UP), advancing the tenant's epoch before each tier. Every
 * cache write checks the epoch the request started with after it lands and
 * removes itself when it moved, so a write that lands after a tier was cleared
 * never survives, whether it came from a request that was already running or
 * from one that read a lower tier just before that tier was cleared.
 */
@Injectable()
export class TenantFlushService implements OnModuleInit {
	private readonly instanceId = randomUUID()
	private readonly channel: string

	constructor(
		configService: ConfigService,
		private readonly redisCacheService: RedisCacheService,
		private readonly cacheManager: MultiLayerCacheManager,
		private readonly tenantCacheEpochs: TenantCacheEpochs,
		private readonly storageCleanupService: StorageCleanupService,
		private readonly tenantDomainsService: TenantDomainsService,
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

	/**
	 * Clear the tenant here and on every other replica.
	 * @throws TenantFlushIncompleteError (503) when a tier could not be cleared,
	 * after the broadcast, so the caller retries and the other replicas still flush.
	 */
	async flushTenant(tenantSchema: string): Promise<TenantFlushResult> {
		const namespace = imageNamespace(tenantSchema)
		CorrelatedLogger.log(`Flushing cache for tenant namespace: ${namespace}`, TenantFlushService.name)

		const local = await this.clearLocal(tenantSchema, namespace)
		const broadcastReceivers = await this.broadcast(tenantSchema)

		if (local.failures.length > 0) {
			throw new TenantFlushIncompleteError({ tenantSchema, failures: local.failures, broadcastReceivers })
		}

		CorrelatedLogger.log(
			`Cache flush complete for ${namespace}: ${local.filesRemoved} file pair(s) removed${local.diskErrors.length
				? `, ${local.diskErrors.length} error(s)`
				: ''}, broadcast reached ${broadcastReceivers} subscriber(s)`,
			TenantFlushService.name,
		)

		return {
			namespace,
			filesRemoved: local.filesRemoved,
			diskErrors: local.diskErrors,
			broadcastReceivers,
		}
	}

	/** The tenant feed, then disk, then each layered tier bottom-up, advancing the epoch before each; never stops at a failing step. */
	private async clearLocal(tenantSchema: string, namespace: string): Promise<LocalClear> {
		const failures: string[] = []
		let filesRemoved = 0
		let diskErrors: string[] = []

		if (!(await this.tenantDomainsService.refresh())) {
			failures.push('tenant feed: could not be read, the store\'s suspension state is not current')
		}

		this.tenantCacheEpochs.advance(tenantSchema)
		try {
			const disk = await this.storageCleanupService.removeTenantFiles(tenantSchema)
			filesRemoved = disk.filesRemoved
			diskErrors = disk.errors
			if (!disk.complete) {
				failures.push(`disk: ${disk.errors.join('; ')}`)
			}
		}
		catch (error: unknown) {
			failures.push(`disk: ${errorMessage(error)}`)
		}

		for (const layer of LAYERS_BOTTOM_UP) {
			this.tenantCacheEpochs.advance(tenantSchema)
			try {
				await this.cacheManager.invalidateNamespace(namespace, layer)
			}
			catch (error: unknown) {
				failures.push(`${layer}: ${errorMessage(error)}`)
			}
		}

		return { filesRemoved, diskErrors, failures }
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
		const local = await this.clearLocal(message.tenantSchema, namespace)
		for (const failure of local.failures) {
			CorrelatedLogger.error(`Peer flush of ${namespace} failed in the ${failure}`, undefined, TenantFlushService.name)
		}
		if (local.failures.length === 0) {
			CorrelatedLogger.log(
				`Peer flush for ${namespace}: ${local.filesRemoved} file pair(s) removed${local.diskErrors.length
					? `, ${local.diskErrors.length} error(s)`
					: ''}`,
				TenantFlushService.name,
			)
		}
	}
}
