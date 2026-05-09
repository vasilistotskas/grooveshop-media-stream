import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common'
import { MultiLayerCacheManager } from '../services/multi-layer-cache.manager.js'

/**
 * Validates a tenant schema string against the canonical pattern.
 * Must match the pattern used in RequestValidatorService and
 * CacheOperationsProcessor: lowercase letter or underscore at the start,
 * followed by up to 62 lowercase alphanumeric or underscore characters.
 */
const TENANT_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/

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
	private readonly _logger = new Logger(AdminCacheController.name)

	constructor(private readonly cacheManager: MultiLayerCacheManager) {}

	/**
	 * Flush all cache entries that belong to a specific tenant.
	 *
	 * Cache keys are stored under the namespace ``image:{tenantSchema}``, so this
	 * performs a targeted SCAN-based invalidation of the ``image:{tenantSchema}:*``
	 * key range across every active cache layer (memory + Redis).  Keys from other
	 * tenants are not touched.
	 *
	 * Body: ``{ "tenantSchema": "acme" }``
	 *
	 * Guards: requires ``x-internal-secret`` header matching INTERNAL_ADMIN_SECRET.
	 *
	 * Returns: ``{ flushed: true, tenantSchema, namespace, timestamp }``
	 */
	@Post('flush-tenant')
	@HttpCode(HttpStatus.OK)
	async flushTenant(@Body() body: FlushTenantBody): Promise<{
		flushed: boolean
		tenantSchema: string
		namespace: string
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

		const namespace = `image:${tenantSchema}`
		this._logger.log(`Flushing cache for tenant namespace: ${namespace}`)

		await this.cacheManager.invalidateNamespace(namespace)

		this._logger.log(`Cache flush complete for tenant namespace: ${namespace}`)

		return {
			flushed: true,
			tenantSchema,
			namespace,
			timestamp: Date.now(),
		}
	}
}
