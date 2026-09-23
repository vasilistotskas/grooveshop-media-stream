import type { ExecutionContext } from '@nestjs/common'
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { MetricsTokenGuard } from '#microservice/Metrics/guards/metrics-token.guard'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

function createContext(headers: Record<string, string | string[]> = {}): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => ({ headers }),
		}),
	} as unknown as ExecutionContext
}

/** The token is read once at construction, so each case builds its own guard. */
function createGuard(token: string): MetricsTokenGuard {
	return new MetricsTokenGuard(createConfigServiceMock({ 'monitoring.metricsToken': token }))
}

describe('metricsTokenGuard', () => {
	it('should fail closed when METRICS_BEARER_TOKEN is not configured', () => {
		expect(() => createGuard('').canActivate(createContext({ authorization: 'Bearer anything' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject an empty configured token even if the bearer value is empty too', () => {
		expect(() => createGuard('').canActivate(createContext({ authorization: 'Bearer ' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject when the Authorization header is missing', () => {
		expect(() => createGuard('scrape-token').canActivate(createContext())).toThrow(UnauthorizedException)
	})

	it('should reject a scheme other than Bearer', () => {
		expect(() => createGuard('scrape-token').canActivate(createContext({ authorization: 'Basic scrape-token' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject the bare token without the Bearer scheme', () => {
		expect(() => createGuard('scrape-token').canActivate(createContext({ authorization: 'scrape-token' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject a wrong token', () => {
		expect(() => createGuard('scrape-token').canActivate(createContext({ authorization: 'Bearer wrong-token!' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject a token of a different length', () => {
		expect(() => createGuard('scrape-token').canActivate(createContext({ authorization: 'Bearer scrape-token-longer' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject a non-string header value', () => {
		expect(() => createGuard('scrape-token').canActivate(createContext({ authorization: ['Bearer scrape-token'] })))
			.toThrow(UnauthorizedException)
	})

	it('should ignore the admin secret header', () => {
		expect(() => createGuard('scrape-token').canActivate(createContext({ 'x-internal-secret': 'scrape-token' })))
			.toThrow(UnauthorizedException)
	})

	it('should allow the configured bearer token', () => {
		expect(createGuard('scrape-token').canActivate(createContext({ authorization: 'Bearer scrape-token' }))).toBe(true)
	})
})
