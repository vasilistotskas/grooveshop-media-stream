import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
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
		if (typeof provided !== 'string' || !this.secretMatches(provided, expected)) {
			throw new UnauthorizedException()
		}

		return true
	}

	/**
	 * Constant-time comparison to avoid leaking the secret's contents via
	 * response-time side channels. `timingSafeEqual` requires equal-length
	 * buffers and throws otherwise, so a length mismatch is checked upfront
	 * and rejected immediately — that early return is itself a (unavoidable
	 * and standard) length-only timing leak, never a content leak.
	 */
	private secretMatches(provided: string, expected: string): boolean {
		const providedBuffer = Buffer.from(provided)
		const expectedBuffer = Buffer.from(expected)

		if (providedBuffer.length !== expectedBuffer.length) {
			return false
		}

		return timingSafeEqual(providedBuffer, expectedBuffer)
	}
}
