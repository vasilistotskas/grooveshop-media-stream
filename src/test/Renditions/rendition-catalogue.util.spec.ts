import type { StorageEntry } from '#microservice/Storage/services/storage-monitoring.service'
import { describe, expect, it } from 'vitest'
import { FitOptions, ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { learnCatalogue } from '#microservice/Renditions/utils/rendition-catalogue.util'

const NOW = 1_800_000_000_000
const DAY = 86_400_000
const LIMITS = { minSources: 3, maxPerKind: 4 }

function options(width: number, overrides: Partial<ResizeOptions> = {}): ResizeOptions {
	return new ResizeOptions({
		width,
		height: 0,
		fit: FitOptions.inside,
		format: SupportedResizeFormats.avif,
		quality: 55,
		...overrides,
	})
}

function entry(source: string | null, resizeOptions: ResizeOptions | null, overrides: Partial<StorageEntry> = {}): StorageEntry {
	return {
		id: `${source}-${resizeOptions?.width}`,
		size: 1000,
		dateCreated: NOW - DAY,
		privateTTL: 30 * DAY,
		accessCount: 0,
		tenantSchema: 'acme',
		source,
		resizeOptions,
		...overrides,
	}
}

/** `width` rendered for each of `count` sources of `kind`. */
function renditions(kind: string, width: number, count: number, overrides: Partial<ResizeOptions> = {}): StorageEntry[] {
	return Array.from({ length: count }, (_, index) => entry(`${kind}/${index}.png`, options(width, overrides)))
}

describe('learnCatalogue', () => {
	it('keeps a rendition that exists for enough different sources of a folder', () => {
		const catalogue = learnCatalogue([
			...renditions('blog', 672, 3),
			...renditions('blog', 1040, 2),
		], NOW, LIMITS)

		expect(catalogue.get('blog')?.map(o => o.width)).toEqual([672])
	})

	it('counts sources, not renditions: one source rendered again does not make a rendition shared', () => {
		const same = Array.from({ length: 5 }, () => entry('blog/a.png', options(672)))

		expect(learnCatalogue(same, NOW, LIMITS).size).toBe(0)
	})

	it('learns each folder on its own', () => {
		const catalogue = learnCatalogue([
			...renditions('blog', 672, 3),
			...renditions('products', 264, 3),
		], NOW, LIMITS)

		expect(catalogue.get('blog')?.map(o => o.width)).toEqual([672])
		expect(catalogue.get('products')?.map(o => o.width)).toEqual([264])
	})

	it('counts the sources of every tenant, because they share one storefront', () => {
		const shared = ['acme', 'globex', 'initech'].map(tenantSchema => entry('blog/a.png', options(672), { tenantSchema }))

		expect(learnCatalogue(shared, NOW, LIMITS).get('blog')).toHaveLength(1)
	})

	it('orders by how many sources share a rendition, then deterministically, and caps the folder', () => {
		const catalogue = learnCatalogue([
			...renditions('blog', 100, 3),
			...renditions('blog', 200, 5),
			...renditions('blog', 300, 4),
			...renditions('blog', 400, 3),
			...renditions('blog', 500, 3),
		], NOW, LIMITS)

		const widths = catalogue.get('blog')?.map(o => o.width)
		expect(widths?.slice(0, 2)).toEqual([200, 300])
		expect(widths).toHaveLength(4)
	})

	it('tells renditions apart by every option, not the width alone', () => {
		const catalogue = learnCatalogue([
			...renditions('blog', 672, 3, { quality: 55 }),
			...renditions('blog', 672, 3, { format: SupportedResizeFormats.webp, quality: 80 }),
		], NOW, LIMITS)

		expect(catalogue.get('blog')).toHaveLength(2)
	})

	it('ignores expired renditions, entries without a recorded source and vector output', () => {
		const expired = renditions('blog', 672, 3).map(e => ({ ...e, dateCreated: NOW - 40 * DAY }))
		const unknown = Array.from({ length: 3 }, () => entry(null, null))
		const vector = renditions('pay_way', 48, 3, { format: SupportedResizeFormats.svg })

		expect(learnCatalogue([
			...expired,
			...unknown,
			...vector,
		], NOW, LIMITS).size).toBe(0)
	})

	it('is empty when nothing is stored', () => {
		expect(learnCatalogue([], NOW, LIMITS).size).toBe(0)
	})
})
