import type { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FitOptions, ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { RenditionCatalogueService } from '#microservice/Cache/services/rendition-catalogue.service'

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

function field(kind: string, resizeOptions: ResizeOptions): string {
	return JSON.stringify([kind, resizeOptions])
}

describe('renditionCatalogueService', () => {
	let client: {
		multi: ReturnType<typeof vi.fn>
		hincrby: ReturnType<typeof vi.fn>
		expire: ReturnType<typeof vi.fn>
		exec: ReturnType<typeof vi.fn>
		hgetall: ReturnType<typeof vi.fn>
		hdel: ReturnType<typeof vi.fn>
	}
	let redis: { getClient: ReturnType<typeof vi.fn> }
	let service: RenditionCatalogueService

	beforeEach(() => {
		client = {
			multi: vi.fn(() => client),
			hincrby: vi.fn(() => client),
			expire: vi.fn(() => client),
			exec: vi.fn().mockResolvedValue([]),
			hgetall: vi.fn().mockResolvedValue({}),
			hdel: vi.fn().mockResolvedValue(0),
		}
		redis = {
			getClient: vi.fn(() => client),
		}
		service = new RenditionCatalogueService(redis as unknown as RedisCacheService)
	})

	describe('record', () => {
		it('counts one more source of the folder for the rendition, and keeps the hash alive', async () => {
			await service.record('blog', options(672))

			expect(client.hincrby).toHaveBeenCalledWith('renditions:catalogue', field('blog', options(672)), 1)
			expect(client.expire).toHaveBeenCalledWith('renditions:catalogue', expect.any(Number))
			expect(client.exec).toHaveBeenCalledOnce()
		})

		it('counts nothing for vector output', async () => {
			await service.record('pay_way', options(48, { format: SupportedResizeFormats.svg }))

			expect(client.multi).not.toHaveBeenCalled()
		})

		it('counts nothing while Redis is unreachable, and never throws', async () => {
			redis.getClient.mockReturnValue(null)
			await expect(service.record('blog', options(672))).resolves.toBeUndefined()

			redis.getClient.mockReturnValue(client)
			client.exec.mockRejectedValue(new Error('READONLY'))
			await expect(service.record('blog', options(672))).resolves.toBeUndefined()
		})
	})

	describe('learn', () => {
		it('keeps a rendition made for enough sources of a folder', async () => {
			client.hgetall.mockResolvedValue({
				[field('blog', options(672))]: '3',
				[field('blog', options(1040))]: '2',
			})

			const catalogue = await service.learn(LIMITS)

			expect(catalogue.get('blog')?.map(o => o.width)).toEqual([672])
		})

		it('learns each folder on its own', async () => {
			client.hgetall.mockResolvedValue({
				[field('blog', options(672))]: '3',
				[field('products', options(264))]: '5',
			})

			const catalogue = await service.learn(LIMITS)

			expect(catalogue.get('blog')?.map(o => o.width)).toEqual([672])
			expect(catalogue.get('products')?.map(o => o.width)).toEqual([264])
		})

		it('orders by how many sources share a rendition, deterministically, and caps the folder', async () => {
			client.hgetall.mockResolvedValue({
				[field('blog', options(100))]: '3',
				[field('blog', options(200))]: '9',
				[field('blog', options(300))]: '4',
				[field('blog', options(400))]: '3',
				[field('blog', options(500))]: '3',
			})

			const widths = (await service.learn(LIMITS)).get('blog')?.map(o => o.width)

			expect(widths?.slice(0, 2)).toEqual([200, 300])
			expect(widths).toHaveLength(4)
		})

		it('tells renditions apart by every option, not the width alone', async () => {
			client.hgetall.mockResolvedValue({
				[field('blog', options(672, { quality: 55 }))]: '3',
				[field('blog', options(672, { format: SupportedResizeFormats.webp, quality: 80 }))]: '3',
			})

			expect((await service.learn(LIMITS)).get('blog')).toHaveLength(2)
		})

		it('gives back resize options that hash like the request that was counted', async () => {
			client.hgetall.mockResolvedValue({ [field('blog', options(672))]: '3' })

			const [learned] = (await service.learn(LIMITS)).get('blog')!

			expect(JSON.stringify(Object.assign(new ResizeOptions(), learned))).toBe(JSON.stringify(options(672)))
		})

		it('is empty when nothing was counted, while Redis is unreachable, or when it fails', async () => {
			await expect(service.learn(LIMITS)).resolves.toEqual(new Map())

			redis.getClient.mockReturnValue(null)
			await expect(service.learn(LIMITS)).resolves.toEqual(new Map())

			redis.getClient.mockReturnValue(client)
			client.hgetall.mockRejectedValue(new Error('READONLY'))
			await expect(service.learn(LIMITS)).resolves.toEqual(new Map())
		})

		it('prunes the renditions too few sources share once the hash outgrows its bound, so enumerating heights cannot grow it forever', async () => {
			const crowded = Object.fromEntries(Array.from({ length: 5001 }, (_, index) => [
				field('blog', options(100 + index)),
				'1',
			]))
			crowded[field('blog', options(672))] = '3'
			client.hgetall.mockResolvedValue(crowded)

			const catalogue = await service.learn(LIMITS)

			expect(client.hdel).toHaveBeenCalledOnce()
			expect(client.hdel.mock.calls[0]).not.toContain(field('blog', options(672)))
			expect(catalogue.get('blog')?.map(o => o.width)).toEqual([672])
		})
	})
})
