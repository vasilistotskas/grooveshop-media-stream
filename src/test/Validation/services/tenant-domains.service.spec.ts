import type { MockedObject } from 'vitest'
import type { ConfigOverrides } from '../../helpers/config-service.mock.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

function jsonResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: async () => body,
	} as Response
}

describe('tenantDomainsService', () => {
	let configValues: ConfigOverrides
	let fetchMock: ReturnType<typeof vi.fn>
	let metricsService: MockedObject<MetricsService>
	let activeService: TenantDomainsService | undefined

	// Config is read in the constructor, so each test builds its service after
	// setting configValues. The instance is tracked so afterEach can clear the
	// refresh interval onModuleInit registers.
	function createService(): TenantDomainsService {
		activeService = new TenantDomainsService(createConfigServiceMock(configValues), metricsService)
		return activeService
	}

	beforeEach(() => {
		// Schema defaults apply otherwise: empty secret (disabled), empty
		// refreshUrl (derive from backend.url), 300000ms interval.
		configValues = {
			'backend.url': 'http://backend.internal:8000',
		}

		fetchMock = vi.fn()
		vi.stubGlobal('fetch', fetchMock)

		metricsService = {
			updateTenantDomainsMetrics: vi.fn(),
		} as unknown as MockedObject<MetricsService>
	})

	afterEach(() => {
		activeService?.onModuleDestroy()
		activeService = undefined
		vi.unstubAllGlobals()
	})

	describe('disabled (no secret)', () => {
		it('never calls fetch and isAllowed always returns false', async () => {
			const service = createService()
			await service.onModuleInit()

			expect(fetchMock).not.toHaveBeenCalled()
			expect(service.isAllowed('acme.example')).toBe(false)
			expect(service.getDomains().size).toBe(0)
		})

		it('refresh() is a no-op when disabled, and reports nothing to bring current', async () => {
			const service = createService()

			await expect(service.refresh()).resolves.toBe(true)

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

		it('fetches the feed derived from backend.url with the internal token header and populates domains', async () => {
			fetchMock.mockResolvedValue(jsonResponse({ domains: ['acme.example', 'api.acme.example'], suspendedSchemas: [] }))

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
			fetchMock.mockResolvedValue(jsonResponse({ domains: ['Acme.Example'], suspendedSchemas: [] }))

			const service = createService()
			await service.onModuleInit()

			expect(service.isAllowed('acme.example')).toBe(true)
			expect(service.isAllowed('ACME.EXAMPLE')).toBe(true)
		})

		it('uses an explicit refreshUrl override instead of deriving from backend.url', async () => {
			configValues['tenantDomains.refreshUrl'] = 'https://internal.override/domains-feed'
			fetchMock.mockResolvedValue(jsonResponse({ domains: [], suspendedSchemas: [] }))

			const service = createService()
			await service.onModuleInit()

			expect(fetchMock).toHaveBeenCalledWith('https://internal.override/domains-feed', expect.anything())
		})

		it('records isEnabled() = true, sets getLastSuccessfulRefresh(), and reports the gauges via MetricsService on success', async () => {
			fetchMock.mockResolvedValue(jsonResponse({ domains: ['acme.example', 'api.acme.example'], suspendedSchemas: [] }))
			const before = Date.now()

			const service = createService()
			await service.onModuleInit()

			expect(service.isEnabled()).toBe(true)
			const lastRefresh = service.getLastSuccessfulRefresh()
			expect(lastRefresh).toBeDefined()
			expect(lastRefresh!).toBeGreaterThanOrEqual(before)
			expect(metricsService.updateTenantDomainsMetrics).toHaveBeenCalledWith(2, 0, lastRefresh)
		})
	})

	describe('refresh failures keep the last known-good set', () => {
		beforeEach(() => {
			configValues['tenantDomains.secret'] = 's3cr3t'
		})

		it('keeps the previous set when a later refresh throws (network error)', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'], suspendedSchemas: [] }))
			const service = createService()
			await service.onModuleInit()
			expect(service.isAllowed('acme.example')).toBe(true)

			fetchMock.mockRejectedValueOnce(new Error('network down'))
			await service.refresh()

			expect(service.isAllowed('acme.example')).toBe(true)
			expect(service.getDomains().size).toBe(1)
		})

		it('keeps the previous set when the feed responds non-2xx', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'], suspendedSchemas: [] }))
			const service = createService()
			await service.onModuleInit()

			fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 404))
			await service.refresh()

			expect(service.isAllowed('acme.example')).toBe(true)
			expect(service.getDomains().size).toBe(1)
		})

		it('keeps the previous set when the feed returns a malformed payload', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'], suspendedSchemas: [] }))
			const service = createService()
			await service.onModuleInit()

			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: 'not-an-array', suspendedSchemas: [] }))
			await service.refresh()

			expect(service.isAllowed('acme.example')).toBe(true)
			expect(service.getDomains().size).toBe(1)
		})

		describe('suspended stores', () => {
			it('refuses the schemas the feed lists as suspended, and only those', async () => {
				fetchMock.mockResolvedValue(jsonResponse({ domains: [], suspendedSchemas: ['closed_shop'] }))
				const service = createService()
				await service.onModuleInit()

				expect(service.isSuspended('closed_shop')).toBe(true)
				expect(service.isSuspended('open_shop')).toBe(false)
				expect(metricsService.updateTenantDomainsMetrics).toHaveBeenCalledWith(0, 1, expect.any(Number))
			})

			it('lifts a suspension the next refresh no longer lists', async () => {
				fetchMock.mockResolvedValueOnce(jsonResponse({ domains: [], suspendedSchemas: ['closed_shop'] }))
				const service = createService()
				await service.onModuleInit()

				fetchMock.mockResolvedValueOnce(jsonResponse({ domains: [], suspendedSchemas: [] }))
				await expect(service.refresh()).resolves.toBe(true)

				expect(service.isSuspended('closed_shop')).toBe(false)
			})

			it('ignores entries that are not valid schema names', async () => {
				fetchMock.mockResolvedValue(jsonResponse({ domains: [], suspendedSchemas: ['ok_shop', 'Bad-Name', 7, '', '../x'] }))
				const service = createService()
				await service.onModuleInit()

				expect(service.isSuspended('ok_shop')).toBe(true)
				expect(service.isSuspended('Bad-Name')).toBe(false)
				expect(service.isSuspended('../x')).toBe(false)
			})

			// A suspension must not lapse because Django could not be read.
			it.each([
				['an unreachable feed', () => fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))],
				['a non-2xx answer', () => fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 503))],
			])('keeps the last known suspensions and reports failure on %s', async (_case, failNext) => {
				fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'], suspendedSchemas: ['closed_shop'] }))
				const service = createService()
				await service.onModuleInit()

				failNext()
				await expect(service.refresh()).resolves.toBe(false)

				expect(service.isSuspended('closed_shop')).toBe(true)
				expect(service.isAllowed('acme.example')).toBe(true)
			})

			// A Django older than the field (a rollback) must not cost the
			// domain allowlist that CORS and the rate limit rely on.
			it('still takes the domains from a feed without suspendedSchemas, keeping the last suspensions and reporting them stale', async () => {
				fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'], suspendedSchemas: ['closed_shop'] }))
				const service = createService()
				await service.onModuleInit()

				fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example', 'new.example'] }))
				await expect(service.refresh()).resolves.toBe(false)

				expect(service.isAllowed('new.example')).toBe(true)
				expect(service.isSuspended('closed_shop')).toBe(true)
			})

			it('starts with the domains and nothing suspended when a restarted pod reads a feed without suspendedSchemas', async () => {
				fetchMock.mockResolvedValue(jsonResponse({ domains: ['acme.example'] }))
				const service = createService()
				await service.onModuleInit()

				expect(service.isAllowed('acme.example')).toBe(true)
				expect(service.isSuspended('closed_shop')).toBe(false)
				expect(service.getLastSuccessfulRefresh()).toBeDefined()
			})

			it('refuses nothing before the feed has ever been read', () => {
				const service = createService()

				expect(service.isSuspended('closed_shop')).toBe(false)
			})
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
			expect(metricsService.updateTenantDomainsMetrics).toHaveBeenCalledWith(0, 0, undefined)
		})

		it('does NOT advance getLastSuccessfulRefresh() when a later refresh fails, but keeps reporting the last known-good timestamp to metrics', async () => {
			fetchMock.mockResolvedValueOnce(jsonResponse({ domains: ['acme.example'], suspendedSchemas: [] }))
			const service = createService()
			await service.onModuleInit()
			const firstRefresh = service.getLastSuccessfulRefresh()
			expect(firstRefresh).toBeDefined()

			fetchMock.mockRejectedValueOnce(new Error('network down'))
			await service.refresh()

			expect(service.getLastSuccessfulRefresh()).toBe(firstRefresh)
			expect(metricsService.updateTenantDomainsMetrics).toHaveBeenLastCalledWith(1, 0, firstRefresh)
		})
	})

	describe('periodic refresh', () => {
		beforeEach(() => {
			configValues['tenantDomains.secret'] = 's3cr3t'
			configValues['tenantDomains.refreshIntervalMs'] = 1000
		})

		it('refreshes again after the configured interval, and stops after onModuleDestroy', async () => {
			vi.useFakeTimers()

			try {
				fetchMock.mockResolvedValue(jsonResponse({ domains: ['acme.example'], suspendedSchemas: [] }))
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
				vi.useRealTimers()
			}
		})
	})

	describe('refresh ordering', () => {
		beforeEach(() => {
			configValues['tenantDomains.secret'] = 's3cr3t'
		})

		// A poll that read the feed before a suspension must not land after
		// the flush's refresh and restore the older state.
		it('runs refreshes one at a time, so the later call\'s result is the one kept', async () => {
			let answerFirst!: (response: Response) => void
			fetchMock
				.mockReturnValueOnce(new Promise<Response>((resolve) => {
					answerFirst = resolve
				}))
				.mockResolvedValueOnce(jsonResponse({ domains: [], suspendedSchemas: ['closed_shop'] }))
			const service = createService()

			const poll = service.refresh()
			const flush = service.refresh()
			await Promise.resolve()
			expect(fetchMock).toHaveBeenCalledTimes(1)

			answerFirst(jsonResponse({ domains: [], suspendedSchemas: [] }))
			await Promise.all([poll, flush])

			expect(fetchMock).toHaveBeenCalledTimes(2)
			expect(service.isSuspended('closed_shop')).toBe(true)
		})

		it('keeps refreshing after one failed', async () => {
			fetchMock
				.mockRejectedValueOnce(new Error('ECONNRESET'))
				.mockResolvedValueOnce(jsonResponse({ domains: [], suspendedSchemas: ['closed_shop'] }))
			const service = createService()

			await expect(service.refresh()).resolves.toBe(false)
			await expect(service.refresh()).resolves.toBe(true)

			expect(service.isSuspended('closed_shop')).toBe(true)
			service.onModuleDestroy()
		})
	})

	describe('retry after a failed refresh', () => {
		beforeEach(() => {
			configValues['tenantDomains.secret'] = 's3cr3t'
			configValues['tenantDomains.refreshIntervalMs'] = 300000
			vi.useFakeTimers()
		})

		afterEach(() => {
			vi.useRealTimers()
		})

		// A replica that could not read the feed when a flush reached it
		// catches up as soon as Django answers, not at the next poll.
		it('retries with a doubling delay until the feed answers, then stops', async () => {
			fetchMock
				.mockRejectedValueOnce(new Error('down'))
				.mockRejectedValueOnce(new Error('down'))
				.mockResolvedValue(jsonResponse({ domains: [], suspendedSchemas: ['closed_shop'] }))
			const service = createService()

			await service.refresh()
			expect(fetchMock).toHaveBeenCalledTimes(1)

			await vi.advanceTimersByTimeAsync(1000)
			expect(fetchMock).toHaveBeenCalledTimes(2)

			await vi.advanceTimersByTimeAsync(1999)
			expect(fetchMock).toHaveBeenCalledTimes(2)
			await vi.advanceTimersByTimeAsync(1)
			expect(fetchMock).toHaveBeenCalledTimes(3)
			expect(service.isSuspended('closed_shop')).toBe(true)

			await vi.advanceTimersByTimeAsync(60000)
			expect(fetchMock).toHaveBeenCalledTimes(3)
		})

		it('never waits longer than the poll interval between retries', async () => {
			configValues['tenantDomains.refreshIntervalMs'] = 3000
			fetchMock.mockRejectedValue(new Error('down'))
			const service = createService()

			await service.refresh()
			await vi.advanceTimersByTimeAsync(1000 + 2000)
			expect(fetchMock).toHaveBeenCalledTimes(3)
			await vi.advanceTimersByTimeAsync(3000)
			expect(fetchMock).toHaveBeenCalledTimes(4)

			service.onModuleDestroy()
		})

		it('cancels a pending retry on shutdown', async () => {
			fetchMock.mockRejectedValue(new Error('down'))
			const service = createService()

			await service.refresh()
			service.onModuleDestroy()
			await vi.advanceTimersByTimeAsync(10000)

			expect(fetchMock).toHaveBeenCalledTimes(1)
		})
	})
})
