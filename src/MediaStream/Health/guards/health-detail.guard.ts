import type { CanActivate, ExecutionContext } from '@nestjs/common'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { getClientIp, isInternalIp } from '#microservice/common/utils/ip.util'

/**
 * Guard that restricts access to detailed health information to requests
 * originating from within the cluster (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
 * or localhost. Prevents internal system metrics from being exposed publicly.
 */
@Injectable()
export class HealthDetailGuard implements CanActivate {
	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest()

		if (!isInternalIp(getClientIp(request))) {
			throw new ForbiddenException('Access to detailed health information is restricted to internal network')
		}

		return true
	}
}
