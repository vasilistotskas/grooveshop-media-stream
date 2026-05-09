import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { ForbiddenException, Injectable } from '@nestjs/common'

/**
 * Guard that restricts access to detailed health information to requests
 * originating from within the cluster (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * or localhost. Prevents internal system metrics from being exposed publicly.
 */
@Injectable()
export class HealthDetailGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest()
		const ip: string = request.ip
			|| request.socket?.remoteAddress
			|| request.connection?.remoteAddress
			|| ''

		if (!this.isInternalIp(ip)) {
			throw new ForbiddenException('Access to detailed health information is restricted to internal network')
		}

		return true
	}

	private isInternalIp(ip: string): boolean {
		// IPv4 loopback
		if (ip === '127.0.0.1')
			return true

		// IPv6 loopback
		if (ip === '::1' || ip === '::ffff:127.0.0.1')
			return true

		// Strip IPv4-mapped IPv6 prefix so the checks below work uniformly
		const bare = ip.startsWith('::ffff:') ? ip.slice(7) : ip

		const parts = bare.split('.').map(Number)
		if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) {
			// Not a dotted-decimal IPv4 address — treat as external
			return false
		}

		const [a, b] = parts

		// 10.0.0.0/8
		if (a === 10)
			return true

		// 172.16.0.0/12
		if (a === 172 && b >= 16 && b <= 31)
			return true

		// 192.168.0.0/16
		if (a === 192 && b === 168)
			return true

		return false
	}
}
