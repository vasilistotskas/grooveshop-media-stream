import type { OnModuleInit } from '@nestjs/common'
import type { StorageConfig } from '#microservice/Config/interfaces/app-config.interface'
import { promises as fs } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { Injectable } from '@nestjs/common'
import { formatBytes } from '#microservice/common/utils/bytes.util'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import ResourceMetaData from '#microservice/HTTP/dto/resource-meta-data.dto'

/** An inventory snapshot is served from memory for this long before the directory is rescanned. */
export const INVENTORY_TTL_MS = 30_000

/** Files stat-ed / sidecars read per batch, so a large tier never opens thousands of handles at once. */
const SCAN_BATCH_SIZE = 64

/** In-flight download (`.rst`) and atomic-write (`.tmp`) files. */
const TEMP_EXTENSIONS = new Set(['.rst', '.tmp'])

/** A servable `{uuid}.rsc` + `{uuid}.rsm` pair. */
export interface StorageEntry {
	id: string
	/** Bytes of the `.rsc` and `.rsm` files together. */
	size: number
	dateCreated: number
	privateTTL: number
	accessCount: number
	tenantSchema: string
}

/** A file the cache can never serve: half a pair, an unparsable sidecar, or a temp file. */
export interface StorageOrphan {
	name: string
	size: number
	/** Last modification, epoch milliseconds. */
	mtime: number
}

export interface StorageInventory {
	entries: StorageEntry[]
	orphans: StorageOrphan[]
	/** Every file except `.gitkeep`, including the `default_optimized_*.webp` fallbacks. */
	totalFiles: number
	totalSize: number
	scannedAt: number
}

export type StorageStatus = 'healthy' | 'warning' | 'critical'

export interface StorageThresholds {
	warningSize: number
	criticalSize: number
	warningFileCount: number
	criticalFileCount: number
}

export interface StorageThresholdCheck {
	status: StorageStatus
	issues: string[]
	inventory: StorageInventory
}

interface ScannedFile {
	name: string
	size: number
	mtime: number
}

export function isExpired(entry: StorageEntry, now: number): boolean {
	return entry.dateCreated + entry.privateTTL <= now
}

async function mapInBatches<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = []
	for (let index = 0; index < items.length; index += SCAN_BATCH_SIZE) {
		results.push(...await Promise.all(items.slice(index, index + SCAN_BATCH_SIZE).map(fn)))
	}
	return results
}

/**
 * Read-only view of the on-disk cache tier. One `readdir` plus a `stat` per
 * file and a `readFile` per `.rsm` sidecar produce a {@link StorageInventory};
 * the cleanup service and the health indicator both work from that snapshot.
 */
@Injectable()
export class StorageMonitoringService implements OnModuleInit {
	readonly thresholds: StorageThresholds
	private readonly directory: string
	private snapshot: StorageInventory | null = null
	private scan: Promise<StorageInventory> | null = null

	constructor(configService: ConfigService) {
		this.directory = storageDirectory(configService)
		const { warningSize, criticalSize, warningFileCount, criticalFileCount } = configService.get<StorageConfig>('storage')
		this.thresholds = { warningSize, criticalSize, warningFileCount, criticalFileCount }
	}

	async onModuleInit(): Promise<void> {
		try {
			await fs.mkdir(this.directory, { recursive: true })
		}
		catch (error: unknown) {
			CorrelatedLogger.error(
				`Failed to create storage directory ${this.directory}: ${errorMessage(error)}`,
				error instanceof Error ? error.stack : undefined,
				StorageMonitoringService.name,
			)
			throw error
		}
	}

	/**
	 * Snapshot of the tier, served from memory while younger than `maxAgeMs`.
	 * `getInventory(0)` forces a rescan; concurrent callers share one scan.
	 */
	async getInventory(maxAgeMs = INVENTORY_TTL_MS): Promise<StorageInventory> {
		if (this.snapshot && Date.now() - this.snapshot.scannedAt < maxAgeMs) {
			return this.snapshot
		}
		this.scan ??= this.scanDirectory().finally(() => {
			this.scan = null
		})
		return this.scan
	}

	async checkThresholds(): Promise<StorageThresholdCheck> {
		const inventory = await this.getInventory()
		const { warningSize, criticalSize, warningFileCount, criticalFileCount } = this.thresholds
		const issues: string[] = []
		let status: StorageStatus = 'healthy'

		if (inventory.totalSize >= criticalSize) {
			status = 'critical'
			issues.push(`Storage size critical: ${formatBytes(inventory.totalSize)} / ${formatBytes(criticalSize)}`)
		}
		else if (inventory.totalSize >= warningSize) {
			status = 'warning'
			issues.push(`Storage size warning: ${formatBytes(inventory.totalSize)} / ${formatBytes(warningSize)}`)
		}

		if (inventory.totalFiles >= criticalFileCount) {
			status = 'critical'
			issues.push(`File count critical: ${inventory.totalFiles} / ${criticalFileCount}`)
		}
		else if (inventory.totalFiles >= warningFileCount) {
			if (status === 'healthy') {
				status = 'warning'
			}
			issues.push(`File count warning: ${inventory.totalFiles} / ${warningFileCount}`)
		}

		return { status, issues, inventory }
	}

	private async scanDirectory(): Promise<StorageInventory> {
		const names = (await fs.readdir(this.directory)).filter(name => name !== '.gitkeep')
		const files = await mapInBatches(names, name => this.statFile(name))

		const pairs = new Map<string, { rsc?: ScannedFile, rsm?: ScannedFile }>()
		const orphans: StorageOrphan[] = []
		let totalFiles = 0
		let totalSize = 0

		for (const file of files) {
			if (!file) {
				continue
			}
			totalFiles++
			totalSize += file.size

			const extension = extname(file.name)
			if (extension === '.rsc' || extension === '.rsm') {
				const id = basename(file.name, extension)
				const pair = pairs.get(id) ?? {}
				pair[extension === '.rsc' ? 'rsc' : 'rsm'] = file
				pairs.set(id, pair)
			}
			else if (TEMP_EXTENSIONS.has(extension)) {
				orphans.push(file)
			}
		}

		const entries: StorageEntry[] = []
		const resolved = await mapInBatches([...pairs], async ([id, { rsc, rsm }]) => {
			const metadata = rsc && rsm ? await this.readMetadata(rsm.name) : null
			return { id, rsc, rsm, metadata }
		})

		for (const { id, rsc, rsm, metadata } of resolved) {
			if (rsc && rsm && metadata) {
				entries.push({
					id,
					size: rsc.size + rsm.size,
					dateCreated: metadata.dateCreated,
					privateTTL: metadata.privateTTL,
					accessCount: metadata.accessCount,
					tenantSchema: metadata.tenantSchema,
				})
				continue
			}
			if (rsc) {
				orphans.push(rsc)
			}
			if (rsm) {
				orphans.push(rsm)
			}
		}

		this.snapshot = { entries, orphans, totalFiles, totalSize, scannedAt: Date.now() }
		CorrelatedLogger.debug(
			`Storage scan: ${entries.length} entries, ${orphans.length} orphans, ${totalFiles} files, ${formatBytes(totalSize)}`,
			StorageMonitoringService.name,
		)
		return this.snapshot
	}

	/** `null` for anything that is not a regular file or vanished since `readdir`. */
	private async statFile(name: string): Promise<ScannedFile | null> {
		try {
			const stats = await fs.stat(join(this.directory, name))
			return stats.isFile() ? { name, size: stats.size, mtime: stats.mtimeMs } : null
		}
		catch {
			return null
		}
	}

	/** `null` when the sidecar cannot be read, parsed, or lacks the numeric fields the tier relies on. */
	private async readMetadata(name: string): Promise<ResourceMetaData | null> {
		try {
			const parsed: unknown = JSON.parse(await fs.readFile(join(this.directory, name), 'utf8'))
			if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
				return null
			}
			const metadata = new ResourceMetaData(parsed as Partial<ResourceMetaData>)
			return Number.isFinite(metadata.dateCreated) && Number.isFinite(metadata.privateTTL) ? metadata : null
		}
		catch (error: unknown) {
			CorrelatedLogger.debug(`Unreadable metadata sidecar ${name}: ${errorMessage(error)}`, StorageMonitoringService.name)
			return null
		}
	}
}
