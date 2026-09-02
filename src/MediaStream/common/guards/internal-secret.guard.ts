import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '#microservice/Config/config.service'

/**
 * Guard for internal admin endpoints (/metrics, cache flush, circuit-breaker reset).
 *
 * Callers must supply the `x-internal-secret` header whose value matches
 * `admin.secret` (INTERNAL_ADMIN_SECRET). Fail-closed: an empty secret
 * rejects every caller.
 */
@Injectable()
export class InternalSecretGuard implements CanActivate {
	private readonly expected: string

	constructor(configService: ConfigService) {
		this.expected = configService.get<string>('admin.secret')
	}

	canActivate(context: ExecutionContext): boolean {
		if (!this.expected) {
			throw new UnauthorizedException('Internal endpoints not configured')
		}

		const request = context.switchToHttp().getRequest()
		const provided = request.headers['x-internal-secret']
		if (typeof provided !== 'string' || !this.secretMatches(provided)) {
			throw new UnauthorizedException()
		}

		return true
	}

	/**
	 * Constant-time comparison so response timing cannot leak the secret's
	 * contents. `timingSafeEqual` requires equal-length buffers, so a length
	 * mismatch is rejected upfront — a length-only leak, never a content leak.
	 */
	private secretMatches(provided: string): boolean {
		const providedBuffer = Buffer.from(provided)
		const expectedBuffer = Buffer.from(this.expected)

		if (providedBuffer.length !== expectedBuffer.length) {
			return false
		}

		return timingSafeEqual(providedBuffer, expectedBuffer)
	}
}
