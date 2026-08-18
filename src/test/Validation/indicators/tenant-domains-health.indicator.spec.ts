import type { MockedObject } from 'vitest'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TenantDomainsHealthIndicator } from '#microservice/Validation/indicators/tenant-domains-health.indicator'
import { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'

describe('tenantDomainsHealthIndicator', () => {
	let indicator: TenantDomainsHealthIndicator
	let tenantDomainsService: MockedObject<TenantDomainsService>

	beforeEach(async () => {
		const mockTenantDomainsService = {
			isEnabled: vi.fn(),
			getDomains: vi.fn(),
			getLastSuccessfulRefresh: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				TenantDomainsHealthIndicator,
				{ provide: TenantDomainsService, useValue: mockTenantDomainsService },
			],
		}).compile()

		indicator = module.get(TenantDomainsHealthIndicator)
		tenantDomainsService = module.get(TenantDomainsService)
	})

	it('exposes the "tenant_domains" key', () => {
		expect(indicator.key).toBe('tenant_domains')
	})

	it('reports up (and does not degrade health) when dynamic refresh is not configured', async () => {
		tenantDomainsService.isEnabled.mockReturnValue(false)
		tenantDomainsService.getDomains.mockReturnValue(new Set())
		tenantDomainsService.getLastSuccessfulRefresh.mockReturnValue(undefined)

		const result = await indicator.isHealthy()

		expect(result.tenant_domains.status).toBe('up')
		expect(result.tenant_domains.configured).toBe(false)
		expect(result.tenant_domains.domainCount).toBe(0)
		expect(result.tenant_domains.lastSuccessfulRefresh).toBeNull()
	})

	it('reports down when configured but never successfully refreshed since startup', async () => {
		tenantDomainsService.isEnabled.mockReturnValue(true)
		tenantDomainsService.getDomains.mockReturnValue(new Set())
		tenantDomainsService.getLastSuccessfulRefresh.mockReturnValue(undefined)

		// performHealthCheck() itself does not throw for this state (unlike a
		// hard dependency failure) — it returns a 'down' result object, which
		// is what causes Terminus's HealthCheckExecutor to fail the aggregate
		// check (see health-check-executor.service.js: any returned
		// status !== 'up' is pushed onto `errors`).
		const result = await indicator.isHealthy()

		expect(result.tenant_domains.status).toBe('down')
		expect(result.tenant_domains.configured).toBe(true)
		expect(result.tenant_domains.lastSuccessfulRefresh).toBeNull()
		expect(result.tenant_domains.message).toMatch(/never successfully refreshed/i)
	})

	it('reports up when configured and has refreshed successfully at least once, including domainCount and lastSuccessfulRefresh', async () => {
		const refreshedAt = Date.UTC(2026, 7, 18, 12, 0, 0)
		tenantDomainsService.isEnabled.mockReturnValue(true)
		tenantDomainsService.getDomains.mockReturnValue(new Set(['acme.example', 'api.acme.example']))
		tenantDomainsService.getLastSuccessfulRefresh.mockReturnValue(refreshedAt)

		const result = await indicator.isHealthy()

		expect(result.tenant_domains.status).toBe('up')
		expect(result.tenant_domains.configured).toBe(true)
		expect(result.tenant_domains.domainCount).toBe(2)
		expect(result.tenant_domains.lastSuccessfulRefresh).toBe(new Date(refreshedAt).toISOString())
	})

	it('stays up when configured and previously succeeded, even if the most recent refresh attempt failed (last known-good set retained)', async () => {
		// TenantDomainsService keeps the last known-good set on a failed
		// refresh and never clears lastSuccessfulRefreshAt on failure — this
		// indicator must not flap to 'down' for a single transient blip.
		const refreshedAt = Date.now() - 600_000
		tenantDomainsService.isEnabled.mockReturnValue(true)
		tenantDomainsService.getDomains.mockReturnValue(new Set(['acme.example']))
		tenantDomainsService.getLastSuccessfulRefresh.mockReturnValue(refreshedAt)

		const result = await indicator.isHealthy()

		expect(result.tenant_domains.status).toBe('up')
		expect(result.tenant_domains.refreshAgeMs).toBeGreaterThanOrEqual(600_000)
	})
})
