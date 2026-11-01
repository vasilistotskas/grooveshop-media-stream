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
import { BackgroundYieldError } from '#microservice/common/errors/media-stream.errors'
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

/** Uploads checked for completeness per batch of filesystem calls. */
const CHECK_BATCH_SIZE = 50

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
}

type UploadOutcome = 'completed' | 'failed' | 'interrupted'

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
	/** Uploads known to have all their renditions stored: not asked about again until a restart. */
	private readonly complete = new Set<string>()

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
		const result: CycleResult = { pending: 0, completed: 0, failed: 0 }
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

			const pending = await this.findPending(catalogue)
			result.pending = pending.length
			this.metrics.setRenditionBacklog(pending.length)

			for (const source of pending) {
				if (this.stopping || Date.now() >= deadline) {
					break
				}
				const outcome = await this.generate(source, deadline)
				if (outcome !== 'interrupted') {
					result[outcome]++
				}
			}
			return result
		}
		finally {
			this.running = false
		}
	}

	private async runScheduled(): Promise<void> {
		try {
			const result = await this.runCycle()
			if (result.pending > 0) {
				CorrelatedLogger.log(`Rendition pre-generation: ${result.pending} upload(s) were missing renditions, ${result.completed} completed, ${result.failed} failed`, RenditionGeneratorService.name)
			}
		}
		catch (error: unknown) {
			CorrelatedLogger.error(`Rendition pre-generation failed: ${errorMessage(error)}`, error instanceof Error
				? error.stack
				: undefined, RenditionGeneratorService.name)
		}
	}

	/**
	 * Uploads whose last (least shared) rendition is not stored yet, newest first.
	 * One HEAD per upload not yet known to be complete; a store that cannot answer
	 * ends the pass, because "unknown" is not "missing".
	 */
	private async findPending(catalogue: Map<string, ResizeOptions[]>): Promise<PendingSource[]> {
		const now = Date.now()
		const candidates: Array<UploadedSource & { renditions: ResizeOptions[] }> = []
		for (const source of await this.scanner.scan(this.config.mediaDirectory)) {
			const renditions = catalogue.get(uploadKind(source.source))
			if (renditions && !this.tenantDomains.isSuspended(source.tenantSchema) && !this.complete.has(this.keyOf(source)) && (this.failedUntil.get(this.keyOf(source)) ?? 0) <= now) {
				candidates.push({ ...source, renditions })
			}
		}

		const pending: PendingSource[] = []
		for (let index = 0; index < candidates.length; index += CHECK_BATCH_SIZE) {
			const batch = candidates.slice(index, index + CHECK_BATCH_SIZE)
			const stored = await Promise.all(batch.map(candidate => this.isLastStored(candidate)))
			for (const [position, candidate] of batch.entries()) {
				if (stored[position]) {
					this.complete.add(this.keyOf(candidate))
				}
				else {
					pending.push({ ...candidate, modifiedAt: await this.scanner.modifiedAt(this.config.mediaDirectory, candidate) })
				}
			}
		}
		return pending.sort((a, b) => b.modifiedAt - a.modifiedAt)
	}

	/** Render every rendition of one upload that is not stored. */
	private async generate(source: PendingSource, deadline: number): Promise<UploadOutcome> {
		const lockKey = `renditions:lock:${this.keyOf(source)}`
		if (!await this.redis.acquireLock(lockKey, SOURCE_LOCK_TTL_SECONDS)) {
			return 'completed'
		}
		try {
			for (const options of source.renditions) {
				const outcome = await this.generateOne(source, options, deadline)
				if (outcome !== 'completed') {
					return outcome
				}
			}
			// A write the store refused does not fail the encode that made it, so
			// the upload is done only once its last rendition is seen to be stored.
			if (await this.isLastStored(source)) {
				this.complete.add(this.keyOf(source))
			}
			return 'completed'
		}
		finally {
			await this.redis.delete(lockKey).catch((error: unknown) => {
				CorrelatedLogger.warn(`Could not release ${lockKey}: ${errorMessage(error)}`, RenditionGeneratorService.name)
			})
		}
	}

	private async generateOne(source: PendingSource, options: ResizeOptions, deadline: number): Promise<UploadOutcome> {
		const ctx = await this.contextFor(source, options)
		if (await this.isStored(ctx)) {
			this.record('present')
			return 'completed'
		}
		while (!this.stopping && Date.now() < deadline) {
			try {
				await runAsBackground(() => this.operation.execute(ctx))
				await ctx.stored
				this.record('generated')
				return 'completed'
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

	/** Whether the upload's last rendition is in the store, which is where every replica finds it. */
	private async isLastStored(source: UploadedSource & { renditions: ResizeOptions[] }): Promise<boolean> {
		return this.isStored(await this.contextFor(source, source.renditions[source.renditions.length - 1]))
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
