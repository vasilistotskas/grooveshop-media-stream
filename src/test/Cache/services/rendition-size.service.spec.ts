import type { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REFRESH_INTERVAL_MS, RenditionSizeService, TOUCH_FLUSH_INTERVAL_MS } from '#microservice/Cache/services/rendition-size.service'
import { SEED_RENDITION_SIZES } from '#microservice/common/constants/rendition-size-seed.constant'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

const DAY_MS = 86_400_000
const NOW = 1_800_000_000_000

/** The few Redis commands the service uses, over in-memory state, with the semantics it relies on. */
class FakeRedis {
	readonly zset = new Map<string, number>()
	readonly hash = new Map<string, number>()
	failing = false
	multiCalls = 0

	private check(): void {
		if (this.failing) {
			throw new Error('READONLY')
		}
	}

	multi(): { hincrby: (...a: any[]) => any, expire: (...a: any[]) => any, zadd: (...a: any[]) => any, hdel: (...a: any[]) => any, zremrangebyrank: (...a: any[]) => any, exec: () => Promise<Array<[null, number]>> } {
		this.multiCalls++
		const ops: Array<() => number> = []
		const chain = {
			hincrby: (_key: string, field: string, by: number) => {
				ops.push(() => {
					const next = (this.hash.get(field) ?? 0) + by
					this.hash.set(field, next)
					return next
				})
				return chain
			},
			expire: () => {
				ops.push(() => 1)
				return chain
			},
			zadd: (_key: string, ...rest: Array<string | number>) => {
				const flag = typeof rest[0] === 'string'
					? rest.shift() as string
					: ''
				const [score, member] = rest as [number, string]
				ops.push(() => {
					const exists = this.zset.has(member)
					if ((flag === 'NX' && exists) || (flag === 'XX' && !exists)) {
						return 0
					}
					this.zset.set(member, score)
					return exists
						? 0
						: 1
				})
				return chain
			},
			hdel: (_key: string, field: string) => {
				ops.push(() => Number(this.hash.delete(field)))
				return chain
			},
			zremrangebyrank: (_key: string, start: number, stop: number) => {
				ops.push(() => {
					const ranked = [...this.zset].sort((a, b) => a[1] - b[1])
					const last = stop < 0
						? ranked.length + stop
						: stop
					const doomed = last < start
						? []
						: ranked.slice(start, last + 1)
					doomed.forEach(([member]) => this.zset.delete(member))
					return doomed.length
				})
				return chain
			},
			exec: async () => {
				this.check()
				return ops.map(op => [
					null,
					op(),
				] as [null, number])
			},
		}
		return chain
	}

	async zremrangebyscore(_key: string, _min: string, max: string): Promise<number> {
		this.check()
		const doomed = [...this.zset].filter(([, score]) => score <= Number(max))
		doomed.forEach(([member]) => this.zset.delete(member))
		return doomed.length
	}

	async zcard(): Promise<number> {
		this.check()
		return this.zset.size
	}

	async zrange(): Promise<string[]> {
		this.check()
		return [...this.zset].sort((a, b) => a[1] - b[1]).map(([member]) => member)
	}

	async hlen(): Promise<number> {
		this.check()
		return this.hash.size
	}

	async hgetall(): Promise<Record<string, string>> {
		this.check()
		return Object.fromEntries([...this.hash].map(([field, count]) => [
			field,
			String(count),
		]))
	}

	async hdel(_key: string, ...fields: string[]): Promise<number> {
		this.check()
		return fields.filter(field => this.hash.delete(field)).length
	}
}

describe('renditionSizeService', () => {
	let redis: FakeRedis
	let connected: boolean
	let service: RenditionSizeService

	function build(overrides: Record<string, unknown> = {}): RenditionSizeService {
		return new RenditionSizeService(
			createConfigServiceMock({
				'renditions.sizes.minSources': 3,
				'renditions.sizes.windowDays': 30,
				'renditions.sizes.maxKnown': 4,
				...overrides,
			}),
			{
				getClient: () => connected
					? redis
					: null,
			} as unknown as RedisCacheService,
		)
	}

	async function render(key: string, times: number): Promise<void> {
		for (let index = 0; index < times; index++) {
			await service.recordRendering(key)
		}
	}

	beforeEach(() => {
		vi.useFakeTimers({
			toFake: ['Date', 'setInterval', 'clearInterval'],
		})
		vi.setSystemTime(NOW)
		redis = new FakeRedis()
		connected = true
		service = build()
	})

	afterEach(() => {
		service.onModuleDestroy()
		vi.useRealTimers()
	})

	describe('seeding', () => {
		it('seeds an empty set once, so a first deploy answers the storefront\'s sizes exactly from its first request', async () => {
			await service.refresh()

			expect(SEED_RENDITION_SIZES.length).toBeGreaterThan(40)
			expect(SEED_RENDITION_SIZES.every(size => service.isKnown(size))).toBe(true)
			expect(service.isKnown('9x9')).toBe(false)
		})

		it('does not seed a set that already has sizes, and does not bring back one that left', async () => {
			redis.zset.set('700x410', NOW)
			await service.refresh()
			expect(service.isKnown('672x340')).toBe(false)
			expect(service.isKnown('700x410')).toBe(true)

			redis.zset.clear()
			redis.zset.set('800x600', NOW)
			redis.zset.delete('800x600')
			redis.zset.set('700x410', NOW)
			await service.refresh()
			expect(service.isKnown('672x340')).toBe(false)
		})
	})

	describe('promotion', () => {
		it('makes a size exact once it was rendered for the configured number of uploads', async () => {
			await service.refresh()
			await render('700x410', 2)
			expect(service.isKnown('700x410')).toBe(false)

			await render('700x410', 1)

			expect(service.isKnown('700x410')).toBe(true)
			expect(redis.zset.has('700x410')).toBe(true)
			expect(redis.hash.has('700x410')).toBe(false)
		})

		it('shares the promotion with the other pods, which read it on their next refresh', async () => {
			await service.refresh()
			await render('700x410', 3)
			const other = build()

			await other.refresh()

			expect(other.isKnown('700x410')).toBe(true)
		})

		it('counts sizes separately', async () => {
			await service.refresh()
			await render('700x410', 2)
			await render('300x200', 2)

			expect(service.isKnown('700x410')).toBe(false)
			expect(service.isKnown('300x200')).toBe(false)
		})

		it('uses the configured threshold', async () => {
			service = build({ 'renditions.sizes.minSources': 10 })
			await service.refresh()

			await render('700x410', 9)
			expect(service.isKnown('700x410')).toBe(false)
			await render('700x410', 1)
			expect(service.isKnown('700x410')).toBe(true)
		})

		it('does nothing for a size that is already exact', async () => {
			await service.refresh()
			redis.multiCalls = 0

			await service.recordRendering('672x340')

			expect(redis.multiCalls).toBe(0)
		})

		it('never promotes the original size, a width past the cap, a size past the pixel budget or something that is not a size', async () => {
			await service.refresh()
			for (const key of [
				'0x0',
				'2049x100',
				'8000x8000',
				'100x9000',
				'abc',
				'10x',
				'-5x10',
			]) {
				await render(key, 5)
				expect(service.isKnown(key)).toBe(false)
			}
			expect(redis.hash.size).toBe(0)
		})

		it('promotes a one-axis size', async () => {
			await service.refresh()
			await render('504x0', 3)
			await render('0x300', 3)

			expect(service.isKnown('504x0')).toBe(true)
			expect(service.isKnown('0x300')).toBe(true)
		})
	})

	describe('cap', () => {
		it('holds at most the configured number of exact sizes, evicting the least recently asked', async () => {
			redis.zset.set('100x100', NOW - 4000)
			redis.zset.set('200x200', NOW - 3000)
			redis.zset.set('300x300', NOW - 2000)
			redis.zset.set('400x400', NOW - 1000)
			await service.refresh()

			await render('500x500', 3)
			await service.refresh()

			expect(redis.zset.size).toBe(4)
			expect(service.isKnown('500x500')).toBe(true)
			expect(service.isKnown('100x100')).toBe(false)
			expect(service.isKnown('200x200')).toBe(true)
		})

		it('keeps a size that is being asked for over one that is not, whatever their age', async () => {
			redis.zset.set('100x100', NOW - 4000)
			redis.zset.set('200x200', NOW - 3000)
			redis.zset.set('300x300', NOW - 2000)
			redis.zset.set('400x400', NOW - 1000)
			await service.refresh()
			service.touch('100x100')
			vi.setSystemTime(NOW + 5000)
			await service.flushTouches()

			await render('500x500', 3)
			await service.refresh()

			expect(service.isKnown('100x100')).toBe(true)
			expect(service.isKnown('200x200')).toBe(false)
		})

		it('lets a prober hold no more than the cap, however many sizes it tries', async () => {
			await service.refresh()
			redis.zset.clear()
			for (let width = 100; width < 140; width++) {
				await render(`${width}x50`, 3)
			}

			expect(redis.zset.size).toBe(4)
		})
	})

	describe('expiry', () => {
		it('drops a size nobody asked for within the window, and keeps one that was asked for', async () => {
			redis.zset.set('100x100', NOW - 31 * DAY_MS)
			redis.zset.set('200x200', NOW - 29 * DAY_MS)
			await service.refresh()

			expect(service.isKnown('100x100')).toBe(false)
			expect(service.isKnown('200x200')).toBe(true)
			expect(redis.zset.has('100x100')).toBe(false)
		})

		it('keeps a size alive by asking for it', async () => {
			redis.zset.set('200x200', NOW - 29 * DAY_MS)
			await service.refresh()
			service.touch('200x200')
			await service.flushTouches()
			vi.setSystemTime(NOW + 5 * DAY_MS)

			await service.refresh()

			expect(service.isKnown('200x200')).toBe(true)
		})

		it('seeds again only when the set has emptied, which is when nothing was asked for the whole window', async () => {
			await service.refresh()
			vi.setSystemTime(NOW + 31 * DAY_MS)

			await service.refresh()

			expect(SEED_RENDITION_SIZES.every(size => service.isKnown(size))).toBe(true)
		})
	})

	describe('touch', () => {
		it('never promotes: it only refreshes a size that is already exact', async () => {
			await service.refresh()
			service.touch('700x410')
			await service.flushTouches()

			expect(redis.zset.has('700x410')).toBe(false)
		})

		it('reports a size once per flush however often it was served', async () => {
			redis.zset.set('200x200', NOW - 1000)
			await service.refresh()
			redis.multiCalls = 0
			for (let index = 0; index < 500; index++) {
				service.touch('200x200')
			}
			vi.setSystemTime(NOW + 1000)

			await service.flushTouches()
			await service.flushTouches()

			expect(redis.multiCalls).toBe(1)
			expect(redis.zset.get('200x200')).toBe(NOW + 1000)
		})
	})

	describe('redis down', () => {
		it('treats every size as unknown for a pod that never had a set, and never errors', async () => {
			connected = false

			await expect(service.refresh()).resolves.toBeUndefined()
			await expect(service.recordRendering('700x410')).resolves.toBeUndefined()
			await expect(service.flushTouches()).resolves.toBeUndefined()

			expect(service.isKnown('672x340')).toBe(false)
		})

		it('keeps the set it has when Redis cannot be reached, so a blip does not move every size to a different rendition', async () => {
			await service.refresh()
			connected = false
			await service.refresh()
			expect(service.isKnown('672x340')).toBe(true)

			connected = true
			redis.failing = true
			await service.refresh()
			expect(service.isKnown('672x340')).toBe(true)
		})

		it('does not throw when a command fails, and counts nothing', async () => {
			await service.refresh()
			redis.failing = true

			await expect(service.recordRendering('700x410')).resolves.toBeUndefined()
			service.touch('672x340')
			await expect(service.flushTouches()).resolves.toBeUndefined()

			expect(service.isKnown('700x410')).toBe(false)
		})

		it('reads the set again once Redis is back', async () => {
			connected = false
			await service.refresh()
			connected = true

			await service.refresh()

			expect(service.isKnown('672x340')).toBe(true)
		})
	})

	describe('counts', () => {
		it('drops the sizes seen for a single upload once the hash outgrows its bound, so probing cannot grow it forever', async () => {
			await service.refresh()
			for (let width = 100; width < 2200; width++) {
				redis.hash.set(`${width}x7`, 1)
			}
			redis.hash.set('700x410', 2)

			await service.refresh()

			expect(redis.hash.size).toBe(1)
			expect(redis.hash.has('700x410')).toBe(true)
		})
	})

	describe('timers', () => {
		it('refreshes every minute and reports served sizes every half minute, and stops on shutdown', async () => {
			const refresh = vi.spyOn(service, 'refresh')
			const flush = vi.spyOn(service, 'flushTouches')

			service.onModuleInit()
			expect(refresh).toHaveBeenCalledTimes(1)
			vi.advanceTimersByTime(REFRESH_INTERVAL_MS)
			expect(refresh).toHaveBeenCalledTimes(2)
			expect(flush).toHaveBeenCalledTimes(Math.floor(REFRESH_INTERVAL_MS / TOUCH_FLUSH_INTERVAL_MS))

			service.onModuleDestroy()
			vi.advanceTimersByTime(REFRESH_INTERVAL_MS * 3)
			expect(refresh).toHaveBeenCalledTimes(2)
		})
	})
})
