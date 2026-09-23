import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { secretsMatch } from '#microservice/common/utils/secret-compare.util'
import { ConfigService } from '#microservice/Config/config.service'

const BEARER_PREFIX = 'Bearer '

/**
 * Guard for `GET /metrics`.
 *
 * Callers must send `Authorization: Bearer <monitoring.metricsToken>`
 * (METRICS_BEARER_TOKEN) — the scheme every Prometheus-compatible scraper
 * sends natively. The token is read-only by construction: it is NOT
 * `INTERNAL_ADMIN_SECRET`, so the scraper cannot flush caches or reset the
 * circuit breaker. Fail-closed: an empty token rejects every caller.
 */
@Injectable()
export class MetricsTokenGuard implements CanActivate {
	private readonly expected: string

	constructor(configService: ConfigService) {
		this.expected = configService.get<string>('monitoring.metricsToken')
	}

	canActivate(context: ExecutionContext): boolean {
		if (!this.expected) {
			throw new UnauthorizedException('Metrics endpoint not configured')
		}

		const request = context.switchToHttp().getRequest()
		const header = request.headers.authorization
		if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
			throw new UnauthorizedException()
		}

		if (!secretsMatch(header.slice(BEARER_PREFIX.length), this.expected)) {
			throw new UnauthorizedException()
		}

		return true
	}
}
