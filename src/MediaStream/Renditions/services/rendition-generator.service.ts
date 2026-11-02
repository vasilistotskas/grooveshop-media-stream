import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { OperationContext } from '#microservice/Cache/operations/cache-image-resource.operation'
import type { RenditionsConfig } from '#microservice/Config/interfaces/app-config.interface'
import type { RenditionResult } from '#microservice/Metrics/services/metrics.service'
import type { UploadedSource } from './rendition-source-scanner.service.js'
import { Injectable } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { IMAGE_SOURCES } from '#microservice/API/config/image-sources.config'
import CacheImageRequest, { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { UrlBuilderService } from '#microservice/API/services/url-builder.service'
import CacheImageResourceOperation from '#microservice/Cache/operations/cache-image-resource.operation'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { RenditionCatalogueService } from '#microservice/Cache/services/rendition-catalogue.service'
import { RenditionStoreService } from '#microservice/Cache/services/rendition-store.service'
import { BackgroundYieldError, RenditionStoreUnavailableError } from '#microservice/common/errors/media-stream.errors'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { uploadKind } from '#microservice/common/utils/upload-source.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { runAsBackground } from '#microservice/Processing/services/processing-admission.service'
import { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'
import { RenditionSourceScanner } from './rendition-source-scanner.service.js'

const CRON_JOB_NAME = 'rendition-pregeneration'

/** A cycle ends after this long and the next tick rescans, so a new upload never waits behind a whole backfill. */
export const CYCLE_BUDGET_MS = 5 * 60 * 1000

/** Wait before asking again for a pipeline slot a request is using. */
export const YIELD_BACKOFF_MS = 2000

/** An upload is held by one replica at a time for this long; the other skips it. */
export const SOURCE_LOCK_TTL_SECONDS = 600

/** A source that could not be rendered (missing, too large, not an image) is left alone for this long. */
export const FAILED_SOURCE_RETRY_MS = 6 * 60 * 60 * 1000

/**
 * Store checks (HEAD) in flight at once. Each one in flight beyond the open
 * sockets is a new TLS handshake, and a pod with a CPU limit pays for them
 * together. Measured 2026-11-02 from a staging pod (500m CPU) to R2 in the EU
 * jurisdiction: 8 in flight p50 106 ms, p99 340 ms; 50 at once p50 834 ms,
 * p95 1040 ms, and the first pass after a restart lost every check to the read
 * deadline, which opened the breaker for live requests too.
 */
export const CHECK_CONCURRENCY = 8

interface PendingSource extends UploadedSource {
	renditions: ResizeOptions[]
	modifiedAt: number
}

export interface CycleResult {
	/** Uploads missing renditions when the cycle began. */
	pending: number
	/** Uploads whose renditions are now all stored (or are being stored by the other replica). */
	completed: number
	/** Uploads that could not be rendered and are left alone for a while. */
	failed: number
	/** Uploads the store could not answer about (a check past its deadline): left to the next pass. */
	unchecked: number
	/** The pass ended because the store's breaker opened: the store is failing, not one slow call. */
	storeUnavailable: boolean
}

type UploadOutcome = 'completed' | 'failed' | 'interrupted'

/**
 * A rendition's outcome: `unstored` is an encode the store refused to keep and
 * `unknown` a rendition the store could not say it holds. Either leaves the
 * upload incomplete, for the next pass.
 */
type RenditionOutcome = UploadOutcome | 'unstored' | 'unknown'

/** The set of renditions an upload was checked against, whatever order the catalogue lists them in. */
function fingerprintOf(renditions: ResizeOptions[]): string {
	return renditions.map(options => JSON.stringify(options)).sort().join('|')
}

/**
 * Renders the renditions of an upload before anyone asks for them, so the
 * encode cost follows uploads instead of traffic and a burst of first-time
 * requests (a new store, a new layout, a Lighthouse run) finds them stored.
 *
 * Level-triggered, not event-driven: every cycle compares what the
 * application has stored (`{mediaDirectory}/{tenant}/uploads/**`) with what
 * the cache holds, so it covers every way an image arrives, finds the
 * backlog of existing images by the same pass, and loses nothing when a pod
 * restarts (the state is the storage volume). Which renditions an upload of a
 * folder needs is learned from the renditions already stored for that folder
 * (`learnCatalogue`), so a storefront that asks for new sizes is followed
 * without a change here.
 *
 * It runs as background work (`runAsBackground`): a pipeline slot is used only
 * when no request holds or awaits one, so it can delay a request by at most
 * the encode already running. Two replicas share the volume; a Redis lock per
 * upload keeps them off the same one.
 */
@Injectable()
export class RenditionGeneratorService implements OnModuleInit, OnModuleDestroy {
	private readonly config: RenditionsConfig
	private cronJob: CronJob | null = null
	private running = false
	private stopping = false
	private readonly failedUntil = new Map<string, number>()
	/**
	 * Uploads seen with every rendition of their folder's catalogue stored, with
	 * that catalogue's fingerprint: not asked about again until a restart or until
	 * the catalogue of their folder changes.
	 */
	private readonly complete = new Map<string, string>()

	constructor(
		configService: ConfigService,
		private readonly operation: CacheImageResourceOperation,
		private readonly scanner: RenditionSourceScanner,
		private readonly urlBuilder: UrlBuilderService,
		private readonly catalogueService: RenditionCatalogueService,
		private readonly store: RenditionStoreService,
		private readonly redis: RedisCacheService,
		private readonly tenantDomains: TenantDomainsService,
		private readonly metrics: MetricsService,
		private readonly schedulerRegistry: SchedulerRegistry,
	) {
		this.config = configService.get<RenditionsConfig>('renditions')
	}

	onModuleInit(): void {
		if (!this.config.mediaDirectory || !this.store.enabled) {
			CorrelatedLogger.log('Rendition pre-generation disabled: it needs RENDITIONS_MEDIA_DIRECTORY and the rendition store', RenditionGeneratorService.name)
			return
		}
		this.cronJob = CronJob.from({
			cronTime: this.config.cronSchedule,
			onTick: () => this.runScheduled(),
			waitForCompletion: true,
		})
		this.schedulerRegistry.addCronJob(CRON_JOB_NAME, this.cronJob)
		this.cronJob.start()
		CorrelatedLogger.log(`Rendition pre-generation scheduled: ${this.config.cronSchedule}, reading ${this.config.mediaDirectory}`, RenditionGeneratorService.name)
	}

	onModuleDestroy(): void {
		this.stopping = true
		this.cronJob?.stop()
	}

	/** One pass over the uploads; a pass already running makes this a no-op. */
	async runCycle(): Promise<CycleResult> {
		const result: CycleResult = {
			pending: 0,
			completed: 0,
			failed: 0,
			unchecked: 0,
			storeUnavailable: false,
		}
		if (this.running) {
			return result
		}
		this.running = true
		const deadline = Date.now() + CYCLE_BUDGET_MS
		try {
			const catalogue = await this.catalogueService.learn({
				minSources: this.config.minSources,
				maxPerKind: this.config.maxPerSource,
			})
			if (catalogue.size === 0) {
				this.metrics.setRenditionBacklog(0)
				return result
			}

			const { pending, unchecked } = await this.findPending(catalogue)
			result.pending = pending.length
			result.unchecked = unchecked
			this.metrics.setRenditionBacklog(pending.length)

			for (const source of pending) {
				if (this.stopping || Date.now() >= deadline) {
					break
				}
				if (!this.store.available) {
					break
				}
				const outcome = await this.generate(source, deadline)
				if (outcome !== 'interrupted') {
					result[outcome]++
				}
			}
			result.storeUnavailable = !this.store.available
			return result
		}
		finally {
			this.running = false
		}
	}

	private async runScheduled(): Promise<void> {
		try {
			const result = await this.runCycle()
			if (result.storeUnavailable) {
				CorrelatedLogger.error(`Rendition pre-generation stopped: the rendition store is failing (its breaker is open); ${result.pending} upload(s) were missing renditions, ${result.completed} completed, ${result.unchecked} left unchecked`, undefined, RenditionGeneratorService.name)
			}
			else if (result.pending > 0 || result.unchecked > 0) {
				CorrelatedLogger.log(`Rendition pre-generation: ${result.pending} upload(s) were missing renditions, ${result.completed} completed, ${result.failed} failed, ${result.unchecked} left unchecked`, RenditionGeneratorService.name)
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Rendition pre-generation failed: ${errorMessage(error)}`, error instanceof Error
				? error.stack
				: undefined, RenditionGeneratorService.name)
		}
	}

	/**
	 * Uploads missing a rendition of their folder's catalogue, newest first. An
	 * upload not yet known to be complete is checked rendition by rendition,
	 * least shared first, up to the first one missing; no single rendition stands
	 * for the rest, because a visitor, a refused write or the bucket's expiry can
	 * leave any of them absent. At most `CHECK_CONCURRENCY` checks are in flight.
	 * An upload the store could not answer about is left to the next pass, because
	 * "unknown" is not "missing"; once the store's breaker opens, the rest are too.
	 */
	private async findPending(catalogue: Map<string, ResizeOptions[]>): Promise<{ pending: PendingSource[], unchecked: number }> {
		const now = Date.now()
		const candidates: Array<UploadedSource & { renditions: ResizeOptions[] }> = []
		for (const source of await this.scanner.scan(this.config.mediaDirectory)) {
			const renditions = catalogue.get(uploadKind(source.source))
			if (renditions && !this.tenantDomains.isSuspended(source.tenantSchema) && this.complete.get(this.keyOf(source)) !== fingerprintOf(renditions) && (this.failedUntil.get(this.keyOf(source)) ?? 0) <= now) {
				candidates.push({ ...source, renditions })
			}
		}

		const pending: PendingSource[] = []
		let unchecked = 0
		for (let index = 0; index < candidates.length; index += CHECK_CONCURRENCY) {
			if (!this.store.available) {
				unchecked += candidates.length - index
				break
			}
			const batch = candidates.slice(index, index + CHECK_CONCURRENCY)
			const stored = await Promise.all(batch.map(candidate => this.isEveryStored(candidate).catch((error: unknown) => {
				if (error instanceof RenditionStoreUnavailableError) {
					return null
				}
				throw error
			})))
			for (const [position, candidate] of batch.entries()) {
				if (stored[position] === null) {
					unchecked++
				}
				else if (stored[position]) {
					this.markComplete(candidate)
				}
				else {
					pending.push({ ...candidate, modifiedAt: await this.scanner.modifiedAt(this.config.mediaDirectory, candidate) })
				}
			}
		}
		return {
			pending: pending.sort((a, b) => b.modifiedAt - a.modifiedAt),
			unchecked,
		}
	}

	/** Render every rendition of one upload that is not stored. */
	private async generate(source: PendingSource, deadline: number): Promise<UploadOutcome> {
		const lockKey = `renditions:lock:${this.keyOf(source)}`
		if (!await this.redis.acquireLock(lockKey, SOURCE_LOCK_TTL_SECONDS)) {
			return 'completed'
		}
		try {
			let everyStored = true
			for (const options of source.renditions) {
				const outcome = await this.generateOne(source, options, deadline)
				if (outcome === 'unstored' || outcome === 'unknown') {
					everyStored = false
				}
				else if (outcome !== 'completed') {
					return outcome
				}
			}
			// A write the store refused, or a check it could not answer, does not
			// fail the upload, but it leaves the upload to the next pass.
			if (everyStored) {
				this.markComplete(source)
			}
			return 'completed'
		}
		finally {
			await this.redis.delete(lockKey).catch((error: unknown) => {
				CorrelatedLogger.warn(`Could not release ${lockKey}: ${errorMessage(error)}`, RenditionGeneratorService.name)
			})
		}
	}

	private async generateOne(source: PendingSource, options: ResizeOptions, deadline: number): Promise<RenditionOutcome> {
		const ctx = await this.contextFor(source, options)
		try {
			if (await this.isStored(ctx)) {
				this.record('present')
				return 'completed'
			}
		}
		catch (error: unknown) {
			// Not rendered blind: an encode for a rendition that may be stored costs
			// more than the next pass asking again.
			if (error instanceof RenditionStoreUnavailableError) {
				return 'unknown'
			}
			throw error
		}
		while (!this.stopping && Date.now() < deadline) {
			try {
				await runAsBackground(() => this.operation.execute(ctx))
				// Unset when the operation found the rendition in memory or Redis and
				// wrote nothing: then it is not known to be in the store either.
				const stored = await ctx.stored === true
				this.record('generated')
				return stored
					? 'completed'
					: 'unstored'
			}
			catch (error: unknown) {
				if (error instanceof BackgroundYieldError) {
					this.record('yielded')
					await new Promise(resolve => setTimeout(resolve, YIELD_BACKOFF_MS))
					continue
				}
				this.record('failed')
				this.failedUntil.set(this.keyOf(source), Date.now() + FAILED_SOURCE_RETRY_MS)
				CorrelatedLogger.warn(`Rendition of ${this.keyOf(source)} not generated, left alone for ${FAILED_SOURCE_RETRY_MS / 3_600_000} h: ${errorMessage(error)}`, RenditionGeneratorService.name)
				return 'failed'
			}
		}
		return 'interrupted'
	}

	/** The request a live visitor of this rendition would have made, hashed the same way. */
	private contextFor(source: UploadedSource, options: ResizeOptions): Promise<OperationContext> {
		const resourceTarget = this.urlBuilder.buildResourceUrl({
			source: IMAGE_SOURCES.UPLOADED_MEDIA,
			params: { tenantSchema: source.tenantSchema, imagePath: source.source },
			correlationId: 'rendition-pregeneration',
		})
		return this.operation.setup(new CacheImageRequest({
			resourceTarget,
			resizeOptions: Object.assign(new ResizeOptions(), options),
			tenantSchema: source.tenantSchema,
		}))
	}

	/** Whether every rendition of the upload is in the store, which is where every replica finds it; stops at the first one missing. */
	private async isEveryStored(source: UploadedSource & { renditions: ResizeOptions[] }): Promise<boolean> {
		for (const options of source.renditions.toReversed()) {
			if (!await this.isStored(await this.contextFor(source, options))) {
				return false
			}
		}
		return true
	}

	private markComplete(source: UploadedSource & { renditions: ResizeOptions[] }): void {
		this.complete.set(this.keyOf(source), fingerprintOf(source.renditions))
	}

	private isStored(ctx: OperationContext): Promise<boolean> {
		return this.store.has(ctx.request.tenantSchema, ctx.id)
	}

	private keyOf({ tenantSchema, source }: UploadedSource): string {
		return `${tenantSchema}/${source}`
	}

	private record(result: RenditionResult): void {
		this.metrics.recordRenditionPregeneration(result)
	}
}
