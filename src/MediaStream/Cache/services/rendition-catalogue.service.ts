import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import { Injectable } from '@nestjs/common'
import { SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { RedisCacheService } from './redis-cache.service.js'

const CATALOGUE_KEY = 'renditions:catalogue'

/** The catalogue is dropped when nothing has been rendered for this long. */
const CATALOGUE_TTL_SECONDS = 90 * 24 * 3600

/** Past this many entries the ones shared by too few sources are pruned: a client enumerating heights cannot grow the hash without bound. */
const MAX_CATALOGUE_ENTRIES = 5000

export interface CatalogueLimits {
	/** A rendition joins the catalogue once it was made for this many different sources of the folder. */
	minSources: number
	/** Most renditions kept per folder. */
	maxPerKind: number
}

/**
 * The renditions each upload folder is shown at, learned from the renditions
 * the service makes: the storefront asks for a few sizes per place an image
 * appears, and every upload of a folder appears in the same places. Making a
 * rendition counts one more source of its folder for it; one made for at least
 * `minSources` sources is one the folder is shown at. The ones shared by the
 * most sources come first, and the last is the one a source is checked for to
 * tell it is done.
 *
 * The counts live in one Redis hash. Redis evicts, and losing the hash costs
 * only the next pre-generation passes: it is learned again from traffic. Vector
 * output is not counted: an SVG source is never pre-generated, and the
 * rasterised icon sizes belong to the SVGs.
 */
@Injectable()
export class RenditionCatalogueService {
	constructor(private readonly redis: RedisCacheService) {}

	/** Count one more source of `kind` made into `options`. Never throws. */
	async record(kind: string, options: ResizeOptions): Promise<void> {
		const client = this.redis.getClient()
		if (!client || options.format === SupportedResizeFormats.svg) {
			return
		}
		try {
			await client.multi()
				.hincrby(CATALOGUE_KEY, JSON.stringify([kind, options]), 1)
				.expire(CATALOGUE_KEY, CATALOGUE_TTL_SECONDS)
				.exec()
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Could not record a rendition in the catalogue: ${errorMessage(error)}`, RenditionCatalogueService.name)
		}
	}

	/** The renditions to pre-generate per folder; empty while Redis is unreachable. */
	async learn(limits: CatalogueLimits): Promise<Map<string, ResizeOptions[]>> {
		const catalogue = new Map<string, ResizeOptions[]>()
		const client = this.redis.getClient()
		if (!client) {
			return catalogue
		}

		let counts: Record<string, string>
		try {
			counts = await client.hgetall(CATALOGUE_KEY)
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Could not read the rendition catalogue: ${errorMessage(error)}`, RenditionCatalogueService.name)
			return catalogue
		}

		const entries = Object.entries(counts)
		if (entries.length > MAX_CATALOGUE_ENTRIES) {
			const rare = entries.filter(([, count]) => Number(count) < limits.minSources).map(([field]) => field)
			if (rare.length > 0) {
				await client.hdel(CATALOGUE_KEY, ...rare).catch(() => 0)
			}
		}

		const byKind = new Map<string, Array<{ field: string, options: ResizeOptions, sources: number }>>()
		for (const [field, count] of entries) {
			const sources = Number(count)
			if (sources < limits.minSources) {
				continue
			}
			const [kind, options] = JSON.parse(field) as [string, ResizeOptions]
			byKind.set(kind, [
				...byKind.get(kind) ?? [],
				{ field, options, sources },
			])
		}
		for (const [kind, renditions] of byKind) {
			catalogue.set(kind, renditions
				.sort((a, b) => b.sources - a.sources || a.field.localeCompare(b.field))
				.slice(0, limits.maxPerKind)
				.map(({ options }) => options))
		}
		return catalogue
	}
}
