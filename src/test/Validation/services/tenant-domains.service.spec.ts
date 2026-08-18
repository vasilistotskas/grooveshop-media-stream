import type { MockedObject } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigService } from '#microservice/Config/config.service'
import { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: async () => body,
	} as Response
}

describe('tenantDomainsService', () => {
	let configService: MockedObject<ConfigService>
	let configValues: Record<string, any>
	let fetchMock: ReturnType<typeof vi.fn>

	function createService(): TenantDomainsService {
		return new TenantDomainsService(configService)
	}

	beforeEach(() => {
		configValues = {
			'tenantDomains.secret': '',
			'tenantDomains.refreshUrl': '',
			'tenantDomains.refreshIntervalMs': 300000,
		}
		configService = {
			getOptional: vi.fn((key: string, defaultValue: any) =>
				key in configValues ? configValues[key] : defaultValue),
		} as unknown as MockedObject<ConfigService>

		fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)
		process.env.BACKEND_URL = 'http://backend.internal:8000'
	})

	afterEach(() => {
		vi.unstubAllGlobals()
		vi.restoreAllMocks()
		delete process.env.BACKEND_URL
	})

	describe('disabled (no secret)', () => {
		it('never calls fetch and isAllowed always returns false', async () => {
			const service = createService()
			await service.onModuleInit()

			expect(fetchMock).not.toHaveBeenCalled()
			expect(service.isAllowed('acme.example')).toBe(false)
			expect(service.getDomains().size).toBe(0)
		})

		it('refresh() is a no-op when disabled', async () => {
			const service = createService()
			await service.refresh()

			expect(fetchMock).not.toHaveBeenCalled()
		})
	})

	describe('initial load', () => {
		beforeEach(() => {
			configValues['tenantDomains.secret'] = 's3cr3t'
		})

		it('fetches the derived BACKEND_URL feed with the internal token header and populates domains', async () => {
			fetchMock.mockResolvedValue(jsonResponse({ domains: ['acme.example', 'api.acme.example'] }))

			const service = createService()
			await service.onModuleInit()

			expect(fetchMock).toHaveBeenCalledWith(
				'http://backend.internal:8000/api/v1/tenant/internal/domains',
				expect.objectContaining({
					headers: { 'X-Internal-Token': 's3cr3t' },
				}),
			)
			expect(service.isAllowed('acme.example')).toBe(true)
			expect(service.isAllowed('api.acme.example')).toBe(true)
			expect(service.isAllowed('not-a-tenant.example')).toBe(false)
			expect(service.getDomains().size).toBe(2)
		})

		it('matches domains case-insensitively', async () => {
			fetchMock.mockResolvedValue(jsonResponse({ domains: ['Acme.Example'] }))

			const service = createService()
			await service.onModuleInit()

			expect(service.isAllowed('acme.example')).toBe(true)
			expect(service.isAllowed('ACME.EXAMPLE')).toBe(true)
		})

		it('uses an explicit refreshUrl override instead of deriving from BACKEND_URL', async () => {
			configValues['tenantDomains.refreshUrl'] = 'https://internal.override/domains-feed'
			fetchMock.mockResolvedValue(jsonResponse({ domains: [] }))

			const service = createService()
			await service.onModuleInit()

			expect(fetchMock).toHaveBeenCalledWith('https://internal.override/domains-feed', expect.anything())
		})
	})

	describe('refresh failures keep the last known-good set', () => {
		beforeEach(() => {
			configValues['tenantDomains.secret'] = 's3cr3t'
		})

		it('keeps the previous set when a later refresh throws (network error)', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'] }))
			const service = createService()
			await service.onModuleInit()
			expect(service.isAllowed('acme.example')).toBe(true)

			fetchMock.mockRejectedValueOnce(new Error('network down'))
			await service.refresh()

			expect(service.isAllowed('acme.example')).toBe(true)
			expect(service.getDomains().size).toBe(1)
		})

		it('keeps the previous set when the feed responds non-2xx', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'] }))
			const service = createService()
			await service.onModuleInit()

			fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 404))
			await service.refresh()

			expect(service.isAllowed('acme.example')).toBe(true)
			expect(service.getDomains().size).toBe(1)
		})

		it('keeps the previous set when the feed returns a malformed payload', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'] }))
			const service = createService()
			await service.onModuleInit()

			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: 'not-an-array' }))
			await service.refresh()

			expect(service.isAllowed('acme.example')).toBe(true)
			expect(service.getDomains().size).toBe(1)
		})

		it('never throws out of onModuleInit even if the very first fetch fails', async () => {
			fetchMock.mockRejectedValue(new Error('boom'))
			const service = createService()

			await expect(service.onModuleInit()).resolves.toBeUndefined()
			expect(service.getDomains().size).toBe(0)
		})
	})

	describe('periodic refresh', () => {
		beforeEach(() => {
			configValues['tenantDomains.secret'] = 's3cr3t'
			configValues['tenantDomains.refreshIntervalMs'] = 1000
		})

		it('refreshes again after the configured interval, and stops after onModuleDestroy', async () => {
			vi.useFakeTimers()
			const originalNodeEnv = process.env.NODE_ENV
			process.env.NODE_ENV = 'production'

			try {
				fetchMock.mockResolvedValue(jsonResponse({ domains: ['acme.example'] }))
				const service = createService()
				await service.onModuleInit()
				expect(fetchMock).toHaveBeenCalledTimes(1)

				await vi.advanceTimersByTimeAsync(1000)
				expect(fetchMock).toHaveBeenCalledTimes(2)

				service.onModuleDestroy()
				await vi.advanceTimersByTimeAsync(5000)
				expect(fetchMock).toHaveBeenCalledTimes(2)
			}
			finally {
				process.env.NODE_ENV = originalNodeEnv
				vi.useRealTimers()
			}
		})
	})
})
