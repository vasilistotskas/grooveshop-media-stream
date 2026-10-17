import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Injectable } from '@nestjs/common'
import { TENANT_SCHEMA_PATTERN } from '#microservice/common/constants/tenant.constant'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'

interface TenantDomainsFeedResponse {
	domains?: unknown
	suspendedSchemas?: unknown
}

const FETCH_TIMEOUT_MS = 10000
/** First retry after a failed refresh; doubles per failure, capped at the poll interval. */
const RETRY_INITIAL_DELAY_MS = 1000

/**
 * Polls Django's internal tenant feed and keeps two in-memory sets:
 *
 * - the hostnames that belong to active tenants. New tenant domains become
 *   allowed for upstream image fetches without a VALIDATION_ALLOWED_DOMAINS
 *   env change + restart;
 * - the schemas of suspended stores, whose images are refused
 *   (`isSuspended`). A deny list: a store created between two polls is
 *   served at once, and a feed that never loaded refuses nothing.
 *
 * Besides the poll, `TenantFlushService` refreshes on every tenant flush,
 * which Django sends when a store is suspended or reactivated, so a state
 * change applies at once rather than at the next poll.
 *
 * Refreshes run one at a time, in call order, so a poll that read the feed
 * before a suspension can never land after the flush's refresh and restore
 * the older state. A failed refresh is retried with backoff (1 s doubling up
 * to the poll interval) rather than at the next poll, so a replica that
 * could not read the feed when a flush reached it catches up as soon as
 * Django answers again.
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
	private suspendedSchemas: ReadonlySet<string> = new Set()
	private refreshTimer?: NodeJS.Timeout
	private retryTimer?: NodeJS.Timeout
	private retryDelayMs = 0
	private destroyed = false
	/** The tail of the refresh queue: each refresh starts after the previous one settled. */
	private refreshQueue: Promise<unknown> = Promise.resolve()
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
		this.destroyed = true
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer)
			this.refreshTimer = undefined
		}
		if (this.retryTimer) {
			clearTimeout(this.retryTimer)
			this.retryTimer = undefined
		}
	}

	isAllowed(domain: string): boolean {
		return this.domains.has(domain.toLowerCase())
	}

	getDomains(): ReadonlySet<string> {
		return this.domains
	}

	/** Whether the store's images must be refused: Django lists it as suspended. */
	isSuspended(tenantSchema: string): boolean {
		return this.suspendedSchemas.has(tenantSchema)
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

	/**
	 * Re-read the feed, after any refresh already running. True when the sets
	 * are current: the feed answered, or it is disabled and there is nothing
	 * to read. False when it could not be read; the last known-good sets are
	 * kept and a retry is scheduled.
	 */
	refresh(): Promise<boolean> {
		if (!this.enabled) {
			return Promise.resolve(true)
		}

		const run = this.refreshQueue.then(async () => {
			const current = await this.readFeed()
			this.scheduleRetry(current)
			return current
		})
		this.refreshQueue = run
		return run
	}

	/** Retry a failed refresh with backoff; a successful one cancels any pending retry. */
	private scheduleRetry(current: boolean): void {
		if (current) {
			this.retryDelayMs = 0
			if (this.retryTimer) {
				clearTimeout(this.retryTimer)
				this.retryTimer = undefined
			}
			return
		}
		if (this.retryTimer || this.destroyed) {
			return
		}
		this.retryDelayMs = this.retryDelayMs === 0
			? RETRY_INITIAL_DELAY_MS
			: Math.min(this.retryDelayMs * 2, this.refreshIntervalMs)
		// unref: a pending retry must never keep the process (or a spec worker) alive.
		this.retryTimer = setTimeout(() => {
			this.retryTimer = undefined
			void this.refresh()
		}, this.retryDelayMs).unref()
	}

	private async readFeed(): Promise<boolean> {
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

			// Read on its own: a feed without it (a Django older than the field)
			// must not cost the domain allowlist, which CORS and the rate limit
			// rely on. The last known suspensions stay, none after a restart.
			if (!Array.isArray(body.suspendedSchemas)) {
				CorrelatedLogger.warn(
					`Tenant feed has no suspendedSchemas list, keeping the last known ${this.suspendedSchemas.size} suspended stores`,
					TenantDomainsService.name,
				)
				return false
			}
			this.suspendedSchemas = new Set(
				body.suspendedSchemas
					.filter((schema): schema is string => typeof schema === 'string' && TENANT_SCHEMA_PATTERN.test(schema)),
			)

			CorrelatedLogger.debug(
				`Refreshed the tenant feed: ${this.domains.size} domains, ${this.suspendedSchemas.size} suspended stores`,
				TenantDomainsService.name,
			)
			return true
		}
		catch (error: unknown) {
			// Keep the last known-good sets — a transient Django outage must not
			// widen or shrink the effective allowlist, nor lift a suspension.
			CorrelatedLogger.warn(
				`Failed to refresh the tenant feed, keeping last known-good sets (${this.domains.size} domains, ${this.suspendedSchemas.size} suspended stores): ${errorMessage(error)}`,
				TenantDomainsService.name,
			)
			return false
		}
		finally {
			this._metricsService.updateTenantDomainsMetrics(this.domains.size, this.suspendedSchemas.size, this.lastSuccessfulRefreshAt)
			clearTimeout(timeoutHandle)
		}
	}
}
