import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import type { RenditionSizesConfig } from '#microservice/Config/interfaces/app-config.interface'
import { Injectable } from '@nestjs/common'
import { MAX_IMAGE_HEIGHT, MAX_TOTAL_PIXELS } from '#microservice/common/constants/image-limits.constant'
import { MAX_RENDITION_WIDTH } from '#microservice/common/constants/rendition-presets.constant'
import { SEED_RENDITION_SIZES } from '#microservice/common/constants/rendition-size-seed.constant'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { RedisCacheService } from './redis-cache.service.js'

/** Sorted set of the exact sizes, scored by when each was last asked for (ms). */
const KNOWN_KEY = 'renditions:sizes:known'

/** Hash of how many uploads each not-yet-exact size was rendered for. */
const SEEN_KEY = 'renditions:sizes:seen'

/** How often a pod reads the exact sizes from Redis, and how often it reports the ones it served. */
export const REFRESH_INTERVAL_MS = 60_000
export const TOUCH_FLUSH_INTERVAL_MS = 30_000

/** Past this many counted sizes the ones seen for a single upload are dropped, so probing cannot grow the hash without bound. */
const MAX_SEEN_ENTRIES = 2000

const DAY_MS = 24 * 60 * 60 * 1000
const SIZE_KEY_RE = /^(\d+)x(\d+)$/

/** Whether a size may become exact: inside the width cap and the pixel budget, and not the original size (0x0). */
function isPromotable(key: string): boolean {
	const match = SIZE_KEY_RE.exec(key)
	if (!match) {
		return false
	}
	const width = Number(match[1])
	const height = Number(match[2])
	return (width > 0 || height > 0)
		&& width <= MAX_RENDITION_WIDTH
		&& height <= MAX_IMAGE_HEIGHT
		&& width * height <= MAX_TOTAL_PIXELS
}

/**
 * The sizes the storefront asks for, learned, so that a request for one is
 * answered with exactly the size it named and costs no extra pixel (any other
 * size snaps up the width ladder, see `toRendition`).
 *
 * A size is counted each time the service renders it for an upload (a first
 * rendering, so the count is of uploads, repeated only after an expiry, a flush
 * or a change of the processing version). At `minSources` it is promoted: added
 * to a Redis sorted set scored by when it was last asked for. A size that is
 * asked for keeps its score fresh; one unused for `windowDays` leaves; past
 * `maxKnown` the least recently asked leaves first. A prober can therefore
 * hold at most `maxKnown` sizes exact, and only by having them rendered for
 * `minSources` uploads each.
 *
 * Requests never wait for Redis: each pod reads the set into memory every
 * minute and `isKnown` answers from there. A Redis that is down changes
 * nothing for a pod that has a set (it keeps the last one: switching a size to
 * a different rendition would only cause a miss) and leaves a pod that never
 * had one answering nothing exactly, never an error. An empty set is seeded
 * once from `SEED_RENDITION_SIZES`, so a first deploy starts where the logs
 * left off.
 */
@Injectable()
export class RenditionSizeService implements OnModuleInit, OnModuleDestroy {
	private readonly config: RenditionSizesConfig
	private known = new Set<string>()
	private readonly touched = new Set<string>()
	private refreshTimer: NodeJS.Timeout | null = null
	private touchTimer: NodeJS.Timeout | null = null
	private redisReachable = true

	constructor(configService: ConfigService, private readonly redis: RedisCacheService) {
		this.config = configService.get<RenditionSizesConfig>('renditions.sizes')
	}

	onModuleInit(): void {
		void this.refresh()
		this.refreshTimer = setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS)
		this.touchTimer = setInterval(() => void this.flushTouches(), TOUCH_FLUSH_INTERVAL_MS)
		this.refreshTimer.unref()
		this.touchTimer.unref()
	}

	onModuleDestroy(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer)
		}
		if (this.touchTimer) {
			clearInterval(this.touchTimer)
		}
	}

	/** Whether the size is answered exactly. Synchronous: it is read on every request. */
	isKnown(key: string): boolean {
		return this.known.has(key)
	}

	/** Note that an exact size was asked for, so it stays exact (reported to Redis in batches). */
	touch(key: string): void {
		if (this.known.has(key)) {
			this.touched.add(key)
		}
	}

	/**
	 * Count one more upload this size was rendered for, and promote it at
	 * `minSources`. Never throws, and does nothing while Redis is unreachable.
	 */
	async recordRendering(key: string): Promise<void> {
		const client = this.redis.getClient()
		if (!client || this.known.has(key) || !isPromotable(key)) {
			return
		}
		try {
			const counted = await client.multi()
				.hincrby(SEEN_KEY, key, 1)
				.expire(SEEN_KEY, this.config.windowDays * DAY_MS / 1000)
				.exec()
			const count = Number(counted?.[0]?.[1] ?? 0)
			if (count < this.config.minSources) {
				return
			}
			await client.multi()
				.zadd(KNOWN_KEY, Date.now(), key)
				.hdel(SEEN_KEY, key)
				.zremrangebyrank(KNOWN_KEY, 0, -(this.config.maxKnown + 1))
				.exec()
			this.known.add(key)
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Could not count a rendition size: ${errorMessage(error)}`, RenditionSizeService.name)
		}
	}

	/**
	 * Read the exact sizes into memory: drop the ones unused for the window,
	 * seed an empty set, and trim the counts. A Redis that cannot answer leaves
	 * the set as it is.
	 */
	async refresh(): Promise<void> {
		const client = this.redis.getClient()
		if (!client) {
			this.noteReachability(false)
			return
		}
		try {
			await client.zremrangebyscore(KNOWN_KEY, '-inf', String(Date.now() - this.config.windowDays * DAY_MS))
			if (await client.zcard(KNOWN_KEY) === 0) {
				await this.seed(client)
			}
			this.known = new Set(await client.zrange(KNOWN_KEY, '0', '-1'))
			await this.trimSeen(client)
			this.noteReachability(true)
		}
		catch (error: unknown) {
			this.noteReachability(false, error)
		}
	}

	/** Report the exact sizes served since the last report, as asked for just now. Never throws. */
	async flushTouches(): Promise<void> {
		const client = this.redis.getClient()
		if (!client || this.touched.size === 0) {
			return
		}
		const keys = [...this.touched]
		this.touched.clear()
		try {
			const pipeline = client.multi()
			const now = Date.now()
			for (const key of keys) {
				// XX: only a size that is still exact; a touch must never promote one.
				pipeline.zadd(KNOWN_KEY, 'XX', now, key)
			}
			await pipeline.exec()
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Could not report the sizes served: ${errorMessage(error)}`, RenditionSizeService.name)
		}
	}

	private async seed(client: NonNullable<ReturnType<RedisCacheService['getClient']>>): Promise<void> {
		const now = Date.now()
		const pipeline = client.multi()
		for (const key of SEED_RENDITION_SIZES) {
			pipeline.zadd(KNOWN_KEY, 'NX', now, key)
		}
		await pipeline.exec()
		CorrelatedLogger.log(`Seeded ${SEED_RENDITION_SIZES.length} exact rendition sizes: the set was empty`, RenditionSizeService.name)
	}

	private async trimSeen(client: NonNullable<ReturnType<RedisCacheService['getClient']>>): Promise<void> {
		if (await client.hlen(SEEN_KEY) <= MAX_SEEN_ENTRIES) {
			return
		}
		const counts = await client.hgetall(SEEN_KEY)
		const single = Object.entries(counts).filter(([, count]) => Number(count) < 2).map(([key]) => key)
		if (single.length > 0) {
			await client.hdel(SEEN_KEY, ...single)
		}
	}

	private noteReachability(reachable: boolean, error?: unknown): void {
		if (reachable !== this.redisReachable) {
			if (reachable) {
				CorrelatedLogger.log('Redis is back: the exact rendition sizes are read again', RenditionSizeService.name)
			}
			else {
				CorrelatedLogger.warn(`Redis cannot answer: keeping ${this.known.size} exact rendition size(s) as they are${error
					? ` (${errorMessage(error)})`
					: ''}`, RenditionSizeService.name)
			}
		}
		this.redisReachable = reachable
	}
}
