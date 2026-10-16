import { Injectable } from '@nestjs/common'
import { PUBLIC_TENANT_SCHEMA } from '#microservice/common/constants/tenant.constant'

/**
 * A per-tenant counter that a flush advances.
 *
 * A request reads it when it starts and writes its result to the cache only
 * while it still matches: a result built from data a flush meant to drop must
 * not outlive the flush. The flush advances the epoch before it clears
 * anything, so a write that lands after the clear is always seen as stale,
 * and a write that landed before is removed by the clear.
 *
 * In-process: each replica holds its own, advanced by its own flush or by the
 * broadcast of another replica's.
 */
@Injectable()
export class TenantCacheEpochs {
	private readonly epochs = new Map<string, number>()

	current(tenantSchema?: string | null): number {
		return this.epochs.get(tenantSchema || PUBLIC_TENANT_SCHEMA) ?? 0
	}

	advance(tenantSchema?: string | null): void {
		const key = tenantSchema || PUBLIC_TENANT_SCHEMA
		this.epochs.set(key, this.current(key) + 1)
	}

	/** Whether a flush of the tenant landed after `epoch` was read. */
	flushedSince(tenantSchema: string | null | undefined, epoch: number): boolean {
		return this.current(tenantSchema) !== epoch
	}
}
