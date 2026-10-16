import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common'
import { TENANT_SCHEMA_PATTERN } from '#microservice/common/constants/tenant.constant'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import { TenantFlushService } from '../services/tenant-flush.service.js'

export interface FlushTenantBody {
	tenantSchema: string
}

/**
 * Admin endpoint for cache management operations.
 * All routes are protected by InternalSecretGuard (x-internal-secret header).
 */
@Controller('admin/cache')
@UseGuards(InternalSecretGuard)
export class AdminCacheController {
	constructor(private readonly tenantFlushService: TenantFlushService) {}

	/**
	 * Flush all cache entries that belong to a specific tenant, on every replica.
	 *
	 * Cache keys are stored under the namespace ``image:{tenantSchema}``. The
	 * replica that takes this request clears its memory tier, the shared Redis
	 * tier and its on-disk tier (the file system layer is read directly by
	 * CacheImageResourceOperation, so without the sweep a flushed resource
	 * resurrects from disk), then broadcasts the tenant over Redis pub/sub so
	 * every other replica drops its own memory and disk entries. Keys/files from
	 * other tenants are not touched.
	 *
	 * Body: ``{ "tenantSchema": "acme" }``
	 *
	 * Guards: requires ``x-internal-secret`` header matching INTERNAL_ADMIN_SECRET.
	 *
	 * Returns: ``{ flushed: true, tenantSchema, namespace, broadcastReceivers, timestamp }``.
	 * ``broadcastReceivers`` counts the subscribers that got the broadcast, this
	 * replica included: with N replicas a healthy flush reports N.
	 */
	@Post('flush-tenant')
	@HttpCode(HttpStatus.OK)
	async flushTenant(@Body() body: FlushTenantBody): Promise<{
		flushed: boolean
		tenantSchema: string
		namespace: string
		broadcastReceivers: number
		timestamp: number
	}> {
		const { tenantSchema } = body ?? {}

		if (!tenantSchema || typeof tenantSchema !== 'string') {
			throw new BadRequestException('tenantSchema is required and must be a string')
		}

		if (!TENANT_SCHEMA_PATTERN.test(tenantSchema)) {
			throw new BadRequestException(
				`tenantSchema "${tenantSchema}" is invalid. Must match /^[a-z_][a-z0-9_]{0,62}$/`,
			)
		}

		const { namespace, broadcastReceivers } = await this.tenantFlushService.flushTenant(tenantSchema)

		return {
			flushed: true,
			tenantSchema,
			namespace,
			broadcastReceivers,
			timestamp: Date.now(),
		}
	}
}
