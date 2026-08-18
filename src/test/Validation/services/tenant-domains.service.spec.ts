import type { MockedObject } from 'vitest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigService } from '#microservice/Config/config.service'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
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
	let metricsService: MockedObject<MetricsService>

	function createService(): TenantDomainsService {
		return new TenantDomainsService(configService, metricsService)
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

		metricsService = {
			updateTenantDomainsMetrics: vi.fn(),
		} as unknown as MockedObject<MetricsService>
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

		it('reports isEnabled() = false and getLastSuccessfulRefresh() = undefined', async () => {
			const service = createService()
			await service.onModuleInit()

			expect(service.isEnabled()).toBe(false)
			expect(service.getLastSuccessfulRefresh()).toBeUndefined()
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

		it('records isEnabled() = true, sets getLastSuccessfulRefresh(), and reports the gauges via MetricsService on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse({ domains: ['acme.example', 'api.acme.example'] }))
			const before = Date.now()

			const service = createService()
			await service.onModuleInit()

			expect(service.isEnabled()).toBe(true)
			const lastRefresh = service.getLastSuccessfulRefresh()
			expect(lastRefresh).toBeDefined()
			expect(lastRefresh!).toBeGreaterThanOrEqual(before)
			expect(metricsService.updateTenantDomainsMetrics).toHaveBeenCalledWith(2, lastRefresh)
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

		it('leaves getLastSuccessfulRefresh() undefined when the very first fetch fails (never-succeeded state for the health indicator)', async () => {
			fetchMock.mockRejectedValue(new Error('wrong secret'))
			const service = createService()
			await service.onModuleInit()

			expect(service.getLastSuccessfulRefresh()).toBeUndefined()
			expect(metricsService.updateTenantDomainsMetrics).toHaveBeenCalledWith(0, undefined)
		})

		it('does NOT advance getLastSuccessfulRefresh() when a later refresh fails, but keeps reporting the last known-good timestamp to metrics', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'] }))
			const service = createService()
			await service.onModuleInit()
			const firstRefresh = service.getLastSuccessfulRefresh()
			expect(firstRefresh).toBeDefined()

			fetchMock.mockRejectedValueOnce(new Error('network down'))
			await service.refresh()

			expect(service.getLastSuccessfulRefresh()).toBe(firstRefresh)
			expect(metricsService.updateTenantDomainsMetrics).toHaveBeenLastCalledWith(1, firstRefresh)
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
