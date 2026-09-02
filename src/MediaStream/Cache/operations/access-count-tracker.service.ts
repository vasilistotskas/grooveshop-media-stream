import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'
import { readFile, rename, writeFile } from 'node:fs/promises'
import { Injectable } from '@nestjs/common'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

export const ACCESS_COUNT_FLUSH_INTERVAL_MS = 30_000
export const ACCESS_COUNT_FLUSH_THRESHOLD = 1000

/**
 * Coalesces cache hits into per-sidecar `accessCount` deltas and folds them
 * into the `.rsm` files in the background, so a hit never pays for a
 * read-modify-write of its sidecar on the request path.
 *
 * Flushes every 30 s, when 1000 sidecars are pending, and on shutdown. Each
 * sidecar is rewritten atomically (write `.tmp`, then rename over the live
 * path); a sidecar that disappeared since the hit simply drops its delta.
 */
@Injectable()
export class AccessCountTracker implements OnModuleInit, OnModuleDestroy {
	private readonly pending = new Map<string, number>()
	private timer: NodeJS.Timeout | null = null
	private inFlight: Promise<void> | null = null

	onModuleInit(): void {
		this.timer = setInterval(() => {
			void this.flush()
		}, ACCESS_COUNT_FLUSH_INTERVAL_MS)
		this.timer.unref()
	}

	async onModuleDestroy(): Promise<void> {
		if (this.timer) {
			clearInterval(this.timer)
			this.timer = null
		}
		await this.flush()
	}

	/** Count one access of the sidecar at `rsmPath`. Never throws. */
	record(rsmPath: string): void {
		this.pending.set(rsmPath, (this.pending.get(rsmPath) ?? 0) + 1)
		if (this.pending.size === ACCESS_COUNT_FLUSH_THRESHOLD) {
			void this.flush()
		}
	}

	/** Persist every pending delta. One flush runs at a time; callers wait for the in-flight one, then flush what accumulated. */
	async flush(): Promise<void> {
		while (this.inFlight) {
			await this.inFlight
		}
		if (this.pending.size === 0) {
			return
		}

		const batch = new Map(this.pending)
		this.pending.clear()
		this.inFlight = this.persist(batch)
		try {
			await this.inFlight
		}
		finally {
			this.inFlight = null
		}
	}

	private async persist(batch: Map<string, number>): Promise<void> {
		for (const [rsmPath, delta] of batch) {
			try {
				const metadata = JSON.parse(await readFile(rsmPath, 'utf8')) as ResourceMetaData
				metadata.accessCount = (metadata.accessCount ?? 0) + delta
				const tmpPath = `${rsmPath}.tmp`
				await writeFile(tmpPath, JSON.stringify(metadata), 'utf8')
				await rename(tmpPath, rsmPath)
			}
			catch (error: unknown) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
					continue
				}
				CorrelatedLogger.warn(`Failed to persist access count for ${rsmPath}: ${errorMessage(error)}`, AccessCountTracker.name)
			}
		}
	}
}
