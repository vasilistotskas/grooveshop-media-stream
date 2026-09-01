import type { ExecutionContext } from '@nestjs/common'
import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { HealthController } from '#microservice/Health/controllers/health.controller'
import { HealthDetailGuard } from '#microservice/Health/guards/health-detail.guard'

function createContext(ip?: string): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => ({ ip }),
		}),
	} as unknown as ExecutionContext
}

describe('healthDetailGuard', () => {
	const guard = new HealthDetailGuard()

	it.each([
		'127.0.0.1',
		'::1',
		'::ffff:127.0.0.1',
		'10.42.0.7',
		'172.16.0.9',
		'192.168.1.50',
	])('should allow internal caller %s', (ip) => {
		expect(guard.canActivate(createContext(ip))).toBe(true)
	})

	it.each([
		'8.8.8.8',
		'203.0.113.10',
		'172.32.0.1',
	])('should reject external caller %s', (ip) => {
		expect(() => guard.canActivate(createContext(ip))).toThrow(ForbiddenException)
	})

	it('should reject when no IP can be determined', () => {
		expect(() => guard.canActivate(createContext(undefined))).toThrow(ForbiddenException)
	})
})

describe('routes protected by HealthDetailGuard', () => {
	// The guard is only worth anything if it is actually attached. Both routes
	// return internal topology — Redis host/port, the upstream URLs media-stream
	// fetches from, disk paths — so a silent removal here would leak it to any
	// caller that can reach the pod.
	it.each([
		['getDetailedHealth'],
		['dependencies'],
	])('should apply the guard to %s', (method) => {
		const handler = (HealthController.prototype as unknown as Record<string, object>)[method]
		const guards = (Reflect.getMetadata('__guards__', handler) ?? []) as unknown[]

		expect(guards).toContain(HealthDetailGuard)
	})

	it.each([
		['check'],
		['readiness'],
		['liveness'],
	])('should leave %s unguarded so probes and uptime checks still work', (method) => {
		const handler = (HealthController.prototype as unknown as Record<string, object>)[method]
		const guards = (Reflect.getMetadata('__guards__', handler) ?? []) as unknown[]

		expect(guards).not.toContain(HealthDetailGuard)
	})
})
