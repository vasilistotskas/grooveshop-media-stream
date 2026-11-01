import type { ResizeOptions } from '#microservice/API/dto/cache-image-request.dto'
import type { StorageEntry } from '#microservice/Storage/services/storage-monitoring.service'
import { SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { uploadKind } from '#microservice/common/utils/upload-source.util'
import { isExpired } from '#microservice/Storage/services/storage-monitoring.service'

export interface CatalogueLimits {
	/** A rendition joins the catalogue once it exists for this many different sources of the folder. */
	minSources: number
	/** Most renditions kept per folder. */
	maxPerKind: number
}

/**
 * The renditions each upload folder is shown at, learned from the renditions
 * already stored: the storefront asks for a few sizes per place an image
 * appears, and every upload of a folder appears in the same places. A
 * rendition that exists for at least `minSources` different sources of a
 * folder is one of them; the ones shared by the most sources come first, and
 * the last is the one a source is checked for to tell it is done.
 *
 * Vector output is left out: an SVG source is never pre-generated, and the
 * rasterised icon sizes belong to the SVGs.
 */
export function learnCatalogue(entries: readonly StorageEntry[], now: number, limits: CatalogueLimits): Map<string, ResizeOptions[]> {
	const byKind = new Map<string, Map<string, { options: ResizeOptions, sources: Set<string> }>>()
	for (const entry of entries) {
		if (!entry.source || !entry.resizeOptions || isExpired(entry, now) || entry.resizeOptions.format === SupportedResizeFormats.svg) {
			continue
		}
		const kind = uploadKind(entry.source)
		const renditions = byKind.get(kind) ?? new Map()
		const key = JSON.stringify(entry.resizeOptions)
		const known = renditions.get(key) ?? {
			options: entry.resizeOptions,
			sources: new Set<string>(),
		}
		known.sources.add(`${entry.tenantSchema}/${entry.source}`)
		renditions.set(key, known)
		byKind.set(kind, renditions)
	}

	const catalogue = new Map<string, ResizeOptions[]>()
	for (const [kind, renditions] of byKind) {
		const shared = [...renditions]
			.filter(([, { sources }]) => sources.size >= limits.minSources)
			.sort(([keyA, a], [keyB, b]) => b.sources.size - a.sources.size || keyA.localeCompare(keyB))
			.slice(0, limits.maxPerKind)
			.map(([, { options }]) => options)
		if (shared.length > 0) {
			catalogue.set(kind, shared)
		}
	}
	return catalogue
}
