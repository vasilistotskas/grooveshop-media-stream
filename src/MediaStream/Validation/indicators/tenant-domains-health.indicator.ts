import type { HealthIndicatorResult } from '@nestjs/terminus'
import { Injectable } from '@nestjs/common'
import { BaseHealthIndicator } from '#microservice/Health/base/base-health-indicator'
import { TenantDomainsService } from '../services/tenant-domains.service.js'

/**
 * Surfaces TenantDomainsService's dynamic-refresh state on /health and
 * /health/dependencies (external-dependency pattern, same as
 * RedisHealthIndicator/HttpHealthIndicator — diagnostic, not part of
 * /health/ready so a broken feed never fails K8s readiness/restarts pods).
 *
 * Without this indicator a misconfigured INTERNAL_DOMAINS_SECRET (or an
 * unreachable Django feed) is only observable via a WARN log line, and the
 * dynamic allowlist silently stays permanently empty.
 *
 * Semantics:
 *  - Disabled (no INTERNAL_DOMAINS_SECRET configured): 'up'. This is a
 *    deliberate, valid operating mode (see TenantDomainsService jsdoc) and
 *    must never degrade the aggregate /health result.
 *  - Configured but never had a successful refresh since startup: 'down'.
 *    The service still functions on the static VALIDATION_ALLOWED_DOMAINS
 *    baseline, so this is a degraded-capability signal (new tenant domains
 *    won't validate) rather than a full outage, but it must be visible
 *    outside log lines.
 *  - Configured and has refreshed successfully at least once: 'up', even if
 *    the most recent refresh attempt failed — TenantDomainsService keeps the
 *    last known-good set on failure by design, so transient Django blips
 *    must not flap /health.
 */
@Injectable()
export class TenantDomainsHealthIndicator extends BaseHealthIndicator {
	constructor(private readonly tenantDomainsService: TenantDomainsService) {
		super('tenant_domains')
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		const configured = this.tenantDomainsService.isEnabled()
		const domainCount = this.tenantDomainsService.getDomains().size
		const lastSuccessfulRefreshAt = this.tenantDomainsService.getLastSuccessfulRefresh()
		const lastSuccessfulRefresh = lastSuccessfulRefreshAt ? new Date(lastSuccessfulRefreshAt).toISOString() : null

		if (!configured) {
			return this.createHealthyResult({
				configured: false,
				domainCount,
				lastSuccessfulRefresh,
				message: 'Dynamic tenant domain refresh disabled (INTERNAL_DOMAINS_SECRET not set) — static allowlist only',
			})
		}

		if (!lastSuccessfulRefreshAt) {
			return this.createUnhealthyResult(
				'Tenant domain feed is configured but has never successfully refreshed since startup — dynamic allowlist is empty (check INTERNAL_DOMAINS_SECRET / feed connectivity)',
				{
					configured: true,
					severity: 'degraded',
					domainCount,
					lastSuccessfulRefresh,
				},
			)
		}

		return this.createHealthyResult({
			configured: true,
			domainCount,
			lastSuccessfulRefresh,
			refreshAgeMs: Date.now() - lastSuccessfulRefreshAt,
		})
	}

	protected getDescription(): string {
		return 'Monitors freshness of the dynamic per-tenant domain allowlist fed from Django'
	}
}
