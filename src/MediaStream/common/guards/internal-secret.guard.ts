import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'

/**
 * Guard for internal admin endpoints (/metrics, /health/circuit-breaker/reset).
 *
 * Callers must supply the `x-internal-secret` header whose value matches the
 * `INTERNAL_ADMIN_SECRET` environment variable.  Fail-closed: if the env var
 * is not set the endpoint is rejected for every caller.
 *
 * This guard depends on the NestJS ConfigService (not our custom wrapper) so
 * that it can be used outside the Config module's provider scope.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
	constructor(private readonly nestConfigService: NestConfigService) {}

	canActivate(context: ExecutionContext): boolean {
		const expected = this.nestConfigService.get<string>('INTERNAL_ADMIN_SECRET')
		if (!expected) {
			// Fail closed: if the secret is not configured, reject all calls.
			throw new UnauthorizedException('Internal endpoints not configured')
		}

		const request = context.switchToHttp().getRequest()
		const provided = request.headers['x-internal-secret']
		if (provided !== expected) {
			throw new UnauthorizedException()
		}

		return true
	}
}
