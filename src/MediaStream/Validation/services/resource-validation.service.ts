import { Injectable } from '@nestjs/common'
import { MAX_FILE_SIZES } from '#microservice/common/constants/image-limits.constant'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { ConfigService } from '#microservice/Config/config.service'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'
import { TenantDomainsService } from './tenant-domains.service.js'

/**
 * Upstream-resource checks that are not route validation: the host allowlist
 * for fetch URLs (SSRF guard) and the per-format size caps.
 */
@Injectable()
export class ResourceValidationService {
	private readonly allowedDomains: readonly string[]

	constructor(
		configService: ConfigService,
		private readonly tenantDomainsService: TenantDomainsService,
	) {
		// Hostnames are case-insensitive (RFC 4343) and URL.hostname is always
		// lowercase, so the configured list is normalised once.
		this.allowedDomains = configService
			.get<string[]>('validation.allowedDomains')
			.map(domain => domain.toLowerCase())
	}

	/**
	 * Only http(s) URLs whose hostname is in the static allowlist OR in the
	 * dynamic tenant-domain set may be fetched. The static list is the
	 * baseline that keeps working when the tenant feed is disabled or down.
	 */
	validateUrl(url: string): boolean {
		let parsed: URL
		try {
			parsed = new URL(url)
		}
		catch (error: unknown) {
			CorrelatedLogger.warn(`Invalid URL format: ${url} (${errorMessage(error)})`, ResourceValidationService.name)
			return false
		}

		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			CorrelatedLogger.warn(`Invalid protocol: ${parsed.protocol}`, ResourceValidationService.name)
			return false
		}

		const { hostname } = parsed
		const allowed = this.allowedDomains.some(domain => hostname === domain || hostname.endsWith(`.${domain}`))
			|| this.tenantDomainsService.isAllowed(hostname)

		if (!allowed) {
			CorrelatedLogger.warn(`URL blocked - not in whitelist: ${hostname}`, ResourceValidationService.name)
			return false
		}

		return true
	}

	/** Per-format upstream size cap from MAX_FILE_SIZES; unknown formats use the default. */
	validateFileSize(sizeBytes: number, format?: string): boolean {
		const maxSize = format
			? (MAX_FILE_SIZES as Record<string, number>)[format.toLowerCase()] || MAX_FILE_SIZES.default
			: MAX_FILE_SIZES.default
		return sizeBytes > 0 && sizeBytes <= maxSize
	}
}
