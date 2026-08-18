import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import * as process from 'node:process'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

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
 * shrinks what InputSanitizationService accepts.
 */
@Injectable()
export class TenantDomainsService implements OnModuleInit, OnModuleDestroy {
	private domains: ReadonlySet<string> = new Set()
	private refreshTimer?: NodeJS.Timeout
	private readonly enabled: boolean
	private readonly secret: string
	private readonly refreshUrl: string
	private readonly refreshIntervalMs: number

	constructor(private readonly _configService: ConfigService) {
		this.secret = this._configService.getOptional<string>('tenantDomains.secret', '')
		this.enabled = this.secret.length > 0

		const configuredUrl = this._configService.getOptional<string>('tenantDomains.refreshUrl', '')
		const backendUrl = process.env.BACKEND_URL ?? ''
		this.refreshUrl = configuredUrl || `${backendUrl}/api/v1/tenant/internal/domains`
		this.refreshIntervalMs = this._configService.getOptional<number>('tenantDomains.refreshIntervalMs', 300000)
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

		// Skip the recurring timer in tests — same convention as MetricsService's
		// periodic-collection guard, to avoid leaking intervals across spec files.
		if (process.env.NODE_ENV !== 'test') {
			this.refreshTimer = setInterval(() => {
				void this.refresh()
			}, this.refreshIntervalMs)
		}
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

			CorrelatedLogger.debug(
				`Refreshed dynamic tenant domain allowlist: ${this.domains.size} domains`,
				TenantDomainsService.name,
			)
		}
		catch (error: unknown) {
			// Keep the last known-good set — a transient Django outage must not
			// widen or shrink the effective allowlist.
			CorrelatedLogger.warn(
				`Failed to refresh tenant domains, keeping last known-good set (${this.domains.size} domains): ${(error as Error).message}`,
				TenantDomainsService.name,
			)
		}
		finally {
			clearTimeout(timeoutHandle)
		}
	}
}
