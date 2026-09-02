import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'

interface TenantDomainsFeedResponse {
	domains?: unknown
}

const FETCH_TIMEOUT_MS = 10000

/**
 * Polls Django's internal tenant-domain feed and keeps an in-memory set of
 * hostnames that belong to active tenants. New tenant domains become
 * allowed for upstream image fetches without a VALIDATION_ALLOWED_DOMAINS
 * env change + restart.
 *
 * Fail-safe by design: disabled entirely when INTERNAL_DOMAINS_SECRET is
 * unset (`isAllowed` then always returns false — callers must OR this with
 * the static allowlist), and a failed refresh keeps the last known-good set
 * rather than clearing it, so a transient Django outage never widens or
 * shrinks what ResourceValidationService accepts.
 */
@Injectable()
export class TenantDomainsService implements OnModuleInit, OnModuleDestroy {
	private domains: ReadonlySet<string> = new Set()
	private refreshTimer?: NodeJS.Timeout
	private readonly enabled: boolean
	private readonly secret: string
	private readonly refreshUrl: string
	private readonly refreshIntervalMs: number
	/**
	 * Wall-clock time (ms since epoch) of the last refresh() call that
	 * completed without error. `undefined` until the very first success —
	 * distinct from an empty `domains` set, which can legitimately happen
	 * on a successful refresh of a feed with zero tenants. Consumed by
	 * TenantDomainsHealthIndicator to detect a permanently broken feed
	 * (e.g. a misconfigured INTERNAL_DOMAINS_SECRET) that would otherwise
	 * only ever surface as a WARN log line.
	 */
	private lastSuccessfulRefreshAt?: number

	constructor(
		private readonly _configService: ConfigService,
		private readonly _metricsService: MetricsService,
	) {
		this.secret = this._configService.get<string>('tenantDomains.secret')
		this.enabled = this.secret.length > 0

		const configuredUrl = this._configService.get<string>('tenantDomains.refreshUrl')
		this.refreshUrl = configuredUrl || `${this._configService.get<string>('backend.url')}/api/v1/tenant/internal/domains`
		this.refreshIntervalMs = this._configService.get<number>('tenantDomains.refreshIntervalMs')
	}

	async onModuleInit(): Promise<void> {
		if (!this.enabled) {
			CorrelatedLogger.log(
				'Dynamic tenant domain refresh disabled (INTERNAL_DOMAINS_SECRET not set)',
				TenantDomainsService.name,
			)
			return
		}

		await this.refresh()

		// unref: the poll must never keep the process (or a spec worker) alive.
		this.refreshTimer = setInterval(() => {
			void this.refresh()
		}, this.refreshIntervalMs).unref()
	}

	onModuleDestroy(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer)
			this.refreshTimer = undefined
		}
	}

	isAllowed(domain: string): boolean {
		return this.domains.has(domain.toLowerCase())
	}

	getDomains(): ReadonlySet<string> {
		return this.domains
	}

	/** Whether dynamic refresh is configured (INTERNAL_DOMAINS_SECRET set). */
	isEnabled(): boolean {
		return this.enabled
	}

	/**
	 * Wall-clock time (ms since epoch) of the last successful refresh, or
	 * `undefined` if a refresh has never succeeded since process start.
	 */
	getLastSuccessfulRefresh(): number | undefined {
		return this.lastSuccessfulRefreshAt
	}

	async refresh(): Promise<void> {
		if (!this.enabled) {
			return
		}

		const controller = new AbortController()
		const timeoutHandle = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

		try {
			const response = await fetch(this.refreshUrl, {
				headers: { 'X-Internal-Token': this.secret },
				signal: controller.signal,
			})

			if (!response.ok) {
				throw new Error(`Tenant domains feed returned HTTP ${response.status}`)
			}

			const body = await response.json() as TenantDomainsFeedResponse
			if (!Array.isArray(body.domains)) {
				throw new TypeError('Tenant domains feed returned a malformed payload (domains is not an array)')
			}

			this.domains = new Set(
				body.domains
					.filter((domain): domain is string => typeof domain === 'string' && domain.length > 0)
					.map(domain => domain.toLowerCase()),
			)
			this.lastSuccessfulRefreshAt = Date.now()

			CorrelatedLogger.debug(
				`Refreshed dynamic tenant domain allowlist: ${this.domains.size} domains`,
				TenantDomainsService.name,
			)
		}
		catch (error: unknown) {
			// Keep the last known-good set — a transient Django outage must not
			// widen or shrink the effective allowlist.
			CorrelatedLogger.warn(
				`Failed to refresh tenant domains, keeping last known-good set (${this.domains.size} domains): ${errorMessage(error)}`,
				TenantDomainsService.name,
			)
		}
		finally {
			this._metricsService.updateTenantDomainsMetrics(this.domains.size, this.lastSuccessfulRefreshAt)
			clearTimeout(timeoutHandle)
		}
	}
}
