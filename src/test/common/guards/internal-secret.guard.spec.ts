import type { ExecutionContext } from '@nestjs/common'
import { UnauthorizedException } from '@nestjs/common'
import { describe, expect, it } from 'vitest'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

function createContext(headers: Record<string, string | string[]> = {}): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => ({ headers }),
		}),
	} as unknown as ExecutionContext
}

/** The secret is read once at construction, so each case builds its own guard. */
function createGuard(secret: string): InternalSecretGuard {
	return new InternalSecretGuard(createConfigServiceMock({ 'admin.secret': secret }))
}

describe('internalSecretGuard', () => {
	it('should fail closed when INTERNAL_ADMIN_SECRET is not configured', () => {
		expect(() => createGuard('').canActivate(createContext({ 'x-internal-secret': 'anything' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject when the header is missing', () => {
		expect(() => createGuard('top-secret').canActivate(createContext())).toThrow(UnauthorizedException)
	})

	it('should reject when the header does not match', () => {
		expect(() => createGuard('top-secret').canActivate(createContext({ 'x-internal-secret': 'wrong' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject a header of a different length', () => {
		expect(() => createGuard('top-secret').canActivate(createContext({ 'x-internal-secret': 'top-secret-longer' })))
			.toThrow(UnauthorizedException)
	})

	it('should allow when the header matches the configured secret', () => {
		expect(createGuard('top-secret').canActivate(createContext({ 'x-internal-secret': 'top-secret' }))).toBe(true)
	})

	it('should reject an empty configured secret even if the header is empty too', () => {
		expect(() => createGuard('').canActivate(createContext({ 'x-internal-secret': '' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject a non-string header value (e.g. a repeated header parsed as an array)', () => {
		expect(() => createGuard('top-secret').canActivate(createContext({ 'x-internal-secret': ['top-secret', 'top-secret'] })))
			.toThrow(UnauthorizedException)
	})
})
