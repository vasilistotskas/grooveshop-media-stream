import { beforeEach, describe, expect, it } from 'vitest'
import { TenantCacheEpochs } from '#microservice/Cache/services/tenant-cache-epochs.service'

describe('tenantCacheEpochs', () => {
	let epochs: TenantCacheEpochs

	beforeEach(() => {
		epochs = new TenantCacheEpochs()
	})

	it('starts every tenant at epoch 0', () => {
		expect(epochs.current('acme')).toBe(0)
	})

	it('advances one tenant without touching another', () => {
		epochs.advance('acme')
		epochs.advance('acme')

		expect(epochs.current('acme')).toBe(2)
		expect(epochs.current('other')).toBe(0)
	})

	it('reports a flush only to a reader that started before it', () => {
		const before = epochs.current('acme')
		epochs.advance('acme')

		expect(epochs.flushedSince('acme', before)).toBe(true)
		expect(epochs.flushedSince('acme', epochs.current('acme'))).toBe(false)
	})

	it.each([undefined, null, ''])('treats %j as the public tenant, like the cache namespace does', (schema) => {
		epochs.advance(schema)

		expect(epochs.current('public')).toBe(1)
		expect(epochs.flushedSince(schema, 0)).toBe(true)
	})
})
