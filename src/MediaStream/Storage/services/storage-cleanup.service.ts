import type { OnModuleInit } from '@nestjs/common'
import type { StorageCleanupConfig } from '#microservice/Config/interfaces/app-config.interface'
import type { StorageEntry, StorageOrphan } from './storage-monitoring.service.js'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { Injectable } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { formatBytes } from '#microservice/common/utils/bytes.util'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { isExpired, StorageMonitoringService } from './storage-monitoring.service.js'

/** Orphans and temp files younger than this may still belong to an in-flight write. */
export const STALE_FILE_MIN_AGE_MS = 60 * 60 * 1000

const CRON_JOB_NAME = 'storage-cleanup'
const DAY_MS = 24 * 60 * 60 * 1000
const MB = 1024 * 1024

export interface CleanupResult {
	removed: {
		/** Pairs whose `dateCreated + privateTTL` has passed. */
		expired: number
		/** Orphan and temp files older than {@link STALE_FILE_MIN_AGE_MS}. */
		stale: number
		/** Pairs evicted to get back under the warning thresholds. */
		evicted: number
	}
	filesRemoved: number
	sizeFreed: number
	errors: string[]
	duration: number
}

export interface CleanupStatus {
	enabled: boolean
	dryRun: boolean
	isRunning: boolean
	lastCleanup: Date | null
	nextCleanup: Date | null
}

interface CleanupRun {
	result: CleanupResult
	dryRun: boolean
	deadline: number
	timedOut: boolean
	remainingFiles: number
	remainingSize: number
}

/**
 * Eviction priority of a pair; higher goes first. Age and size push a pair
 * towards eviction, every recorded cache hit pulls it back.
 */
export function evictionScore(entry: StorageEntry, now: number): number {
	const ageDays = Math.max(now - entry.dateCreated, 0) / DAY_MS
	return Math.min(ageDays * 10, 1000)
		+ Math.max(1000 - entry.accessCount * 10, 0)
		+ Math.min(entry.size / MB, 100)
}

/**
 * Pair-aware hygiene for the on-disk cache tier: expired pairs, stale
 * orphans, then score-based eviction down to the warning thresholds. Runs on
 * the configured cron and on demand.
 */
@Injectable()
export class StorageCleanupService implements OnModuleInit {
	private readonly directory: string
	private readonly config: StorageCleanupConfig
	private readonly minAccessCount: number
	private cronJob: CronJob | null = null
	private lastCleanup: Date | null = null
	private isRunning = false

	constructor(
		configService: ConfigService,
		private readonly monitoring: StorageMonitoringService,
		private readonly schedulerRegistry: SchedulerRegistry,
	) {
		this.directory = storageDirectory(configService)
		this.config = configService.get<StorageCleanupConfig>('storage.cleanup')
		this.minAccessCount = configService.get<number>('storage.eviction.minAccessCount')
	}

	onModuleInit(): void {
		if (!this.config.enabled) {
			CorrelatedLogger.log('Storage cleanup disabled', StorageCleanupService.name)
			return
		}

		this.cronJob = CronJob.from({
			cronTime: this.config.cronSchedule,
			onTick: () => this.runScheduled(),
			// A tick that fires while the previous run is still going is skipped.
			waitForCompletion: true,
		})
		this.schedulerRegistry.addCronJob(CRON_JOB_NAME, this.cronJob)
		this.cronJob.start()
		CorrelatedLogger.log(`Storage cleanup scheduled: ${this.config.cronSchedule}`, StorageCleanupService.name)
	}

	async performCleanup(): Promise<CleanupResult> {
		if (this.isRunning) {
			throw new Error('Cleanup is already running')
		}
		this.isRunning = true

		const startedAt = Date.now()
		const run: CleanupRun = {
			result: { removed: { expired: 0, stale: 0, evicted: 0 }, filesRemoved: 0, sizeFreed: 0, errors: [], duration: 0 },
			dryRun: this.config.dryRun,
			deadline: startedAt + this.config.maxDuration,
			timedOut: false,
			remainingFiles: 0,
			remainingSize: 0,
		}

		try {
			const inventory = await this.monitoring.getInventory(0)
			run.remainingFiles = inventory.totalFiles
			run.remainingSize = inventory.totalSize

			const live = await this.removeExpired(inventory.entries, startedAt, run)
			await this.removeStale(inventory.orphans, startedAt, run)
			await this.evict(live, startedAt, run)

			this.lastCleanup = new Date()
			run.result.duration = Date.now() - startedAt

			const { removed, sizeFreed, errors, duration } = run.result
			CorrelatedLogger.log(
				`Storage cleanup ${run.dryRun ? '(dry run) ' : ''}finished in ${duration}ms: `
				+ `${removed.expired} expired pair(s), ${removed.stale} stale file(s), ${removed.evicted} evicted pair(s), `
				+ `${formatBytes(sizeFreed)} freed, ${errors.length} error(s)`,
				StorageCleanupService.name,
			)
			return run.result
		}
		finally {
			this.isRunning = false
		}
	}

	/**
	 * Remove on-disk cache file pairs (``.rsm`` + ``.rsc``) belonging to a
	 * specific tenant schema.
	 *
	 * ``MultiLayerCacheManager.invalidateNamespace`` only knows about the
	 * memory and Redis layers — the file system tier is read directly by
	 * ``CacheImageResourceOperation`` and is otherwise untouched by a tenant
	 * cache flush. Without this sweep, a flushed resource resurrects from
	 * disk on the next request (stale bytes served, and the disk hit
	 * backfills Redis/memory again with the same stale data).
	 *
	 * Storage filenames are flat UUIDs with no tenant information encoded —
	 * the tenant lives inside each ``.rsm`` metadata JSON's ``tenantSchema``
	 * field (sidecars written before multi-tenancy omit it, which
	 * ``ResourceMetaData`` defaults to ``'public'``). This scans every
	 * ``.rsm`` file, parses it, and removes the ``.rsm`` + matching ``.rsc``
	 * pair when the metadata's tenant matches. Per-file read/parse/unlink
	 * errors are logged and skipped rather than aborting the sweep — file
	 * counts here are small so no bounded-concurrency limiter is needed.
	 */
	async removeTenantFiles(tenantSchema: string): Promise<{ filesRemoved: number, errors: string[] }> {
		const errors: string[] = []
		let filesRemoved = 0

		let allFiles: string[]
		try {
			allFiles = await fs.readdir(this.directory)
		}
		catch (error: unknown) {
			const msg = `Failed to read storage directory for tenant sweep: ${errorMessage(error)}`
			CorrelatedLogger.warn(msg, StorageCleanupService.name)
			return { filesRemoved: 0, errors: [msg] }
		}

		const metaFiles = allFiles.filter(f => f.endsWith('.rsm'))

		const results = await Promise.allSettled(metaFiles.map(async (metaFile) => {
			let content: string
			try {
				content = await fs.readFile(join(this.directory, metaFile), 'utf8')
			}
			catch (error: unknown) {
				throw new Error(`Failed to read metadata ${metaFile}: ${errorMessage(error)}`)
			}

			let metadata: { tenantSchema?: string }
			try {
				metadata = JSON.parse(content)
			}
			catch (error: unknown) {
				throw new Error(`Failed to parse metadata ${metaFile}: ${errorMessage(error)}`)
			}

			if ((metadata.tenantSchema || 'public') !== tenantSchema) {
				return false
			}

			await this.unlinkPair(metaFile.replace(/\.rsm$/, ''))
			return true
		}))

		for (let i = 0; i < results.length; i++) {
			const result = results[i]
			if (result.status === 'fulfilled') {
				if (result.value) {
					filesRemoved++
				}
			}
			else {
				const msg = `Tenant file sweep failed for ${metaFiles[i]}: ${errorMessage(result.reason)}`
				errors.push(msg)
				CorrelatedLogger.warn(msg, StorageCleanupService.name)
			}
		}

		CorrelatedLogger.log(
			`Tenant disk sweep for schema "${tenantSchema}": ${filesRemoved} file pair(s) removed, ${errors.length} error(s)`,
			StorageCleanupService.name,
		)

		return { filesRemoved, errors }
	}

	getCleanupStatus(): CleanupStatus {
		return {
			enabled: this.config.enabled,
			dryRun: this.config.dryRun,
			isRunning: this.isRunning,
			lastCleanup: this.lastCleanup,
			nextCleanup: this.cronJob?.nextDate().toJSDate() ?? null,
		}
	}

	private async runScheduled(): Promise<void> {
		if (this.isRunning) {
			return
		}
		try {
			await this.performCleanup()
		}
		catch (error: unknown) {
			CorrelatedLogger.error(
				`Scheduled storage cleanup failed: ${errorMessage(error)}`,
				error instanceof Error ? error.stack : undefined,
				StorageCleanupService.name,
			)
		}
	}

	/** Pass 1 — returns the pairs that are still within their TTL. */
	private async removeExpired(entries: StorageEntry[], now: number, run: CleanupRun): Promise<StorageEntry[]> {
		const live: StorageEntry[] = []
		for (const entry of entries) {
			if (!isExpired(entry, now)) {
				live.push(entry)
			}
			else if (!this.outOfTime(run) && await this.removePair(entry, run)) {
				run.result.removed.expired++
			}
		}
		return live
	}

	/** Pass 2 — orphans and temp files old enough that no writer can still own them. */
	private async removeStale(orphans: StorageOrphan[], now: number, run: CleanupRun): Promise<void> {
		for (const orphan of orphans) {
			if (now - orphan.mtime < STALE_FILE_MIN_AGE_MS) {
				continue
			}
			if (this.outOfTime(run)) {
				return
			}
			try {
				if (!run.dryRun) {
					await this.unlinkFile(orphan.name)
				}
				this.account(run, 1, orphan.size, orphan.name)
				run.result.removed.stale++
			}
			catch (error: unknown) {
				run.result.errors.push(`Failed to remove ${orphan.name}: ${errorMessage(error)}`)
			}
		}
	}

	/**
	 * Pass 3 — while the tier is still at or above a warning threshold, evict
	 * live pairs by {@link evictionScore}; pairs with `minAccessCount` or more
	 * hits go last.
	 */
	private async evict(entries: StorageEntry[], now: number, run: CleanupRun): Promise<void> {
		const { warningSize, warningFileCount } = this.monitoring.thresholds
		const overThreshold = (): boolean => run.remainingSize >= warningSize || run.remainingFiles >= warningFileCount
		if (!overThreshold()) {
			return
		}

		const ranked = entries
			.map(entry => ({ entry, popular: entry.accessCount >= this.minAccessCount, score: evictionScore(entry, now) }))
			.sort((a, b) => Number(a.popular) - Number(b.popular) || b.score - a.score)

		for (const { entry } of ranked) {
			if (!overThreshold() || this.outOfTime(run)) {
				break
			}
			if (await this.removePair(entry, run)) {
				run.result.removed.evicted++
			}
		}

		if (overThreshold()) {
			CorrelatedLogger.warn(
				`Storage still above warning thresholds after eviction: ${run.remainingFiles} files, ${formatBytes(run.remainingSize)}`,
				StorageCleanupService.name,
			)
		}
	}

	private async removePair(entry: StorageEntry, run: CleanupRun): Promise<boolean> {
		try {
			if (!run.dryRun) {
				await this.unlinkPair(entry.id)
			}
			this.account(run, 2, entry.size, entry.id)
			return true
		}
		catch (error: unknown) {
			run.result.errors.push(`Failed to remove ${entry.id}: ${errorMessage(error)}`)
			return false
		}
	}

	private account(run: CleanupRun, files: number, size: number, name: string): void {
		run.result.filesRemoved += files
		run.result.sizeFreed += size
		run.remainingFiles -= files
		run.remainingSize -= size
		CorrelatedLogger.debug(`${run.dryRun ? '[dry run] ' : ''}Removed ${name} (${formatBytes(size)})`, StorageCleanupService.name)
	}

	/** True once `storage.cleanup.maxDuration` has elapsed; reports the budget exhaustion once. */
	private outOfTime(run: CleanupRun): boolean {
		if (!run.timedOut && Date.now() >= run.deadline) {
			run.timedOut = true
			const msg = `Cleanup time budget (${this.config.maxDuration}ms) exhausted; remaining passes skipped`
			run.result.errors.push(msg)
			CorrelatedLogger.warn(msg, StorageCleanupService.name)
		}
		return run.timedOut
	}

	/** Sidecar first: an `.rsc` without its `.rsm` is harmless, the reverse is a false cache hit. */
	private async unlinkPair(id: string): Promise<void> {
		await this.unlinkFile(`${id}.rsm`)
		await this.unlinkFile(`${id}.rsc`)
	}

	private async unlinkFile(name: string): Promise<void> {
		try {
			await fs.unlink(join(this.directory, name))
		}
		catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				throw error
			}
		}
	}
}
