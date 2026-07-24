import type { ExecutionContext } from '@nestjs/common'
import { UnauthorizedException } from '@nestjs/common'
import { ConfigService as NestConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InternalSecretGuard } from '#microservice/common/guards/internal-secret.guard'

function createContext(headers: Record<string, string> = {}): ExecutionContext {
	return {
		switchToHttp: () => ({
			getRequest: () => ({ headers }),
		}),
	} as unknown as ExecutionContext
}

describe('internalSecretGuard', () => {
	let guard: InternalSecretGuard
	let configGet: ReturnType<typeof vi.fn>

	beforeEach(async () => {
		configGet = vi.fn()
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				InternalSecretGuard,
				{ provide: NestConfigService, useValue: { get: configGet } },
			],
		}).compile()

		guard = module.get(InternalSecretGuard)
	})

	it('should fail closed when INTERNAL_ADMIN_SECRET is not configured', () => {
		configGet.mockReturnValue(undefined)

		expect(() => guard.canActivate(createContext({ 'x-internal-secret': 'anything' })))
			.toThrow(UnauthorizedException)
	})

	it('should reject when the header is missing', () => {
		configGet.mockReturnValue('top-secret')

		expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException)
	})

	it('should reject when the header does not match', () => {
		configGet.mockReturnValue('top-secret')

		expect(() => guard.canActivate(createContext({ 'x-internal-secret': 'wrong' })))
			.toThrow(UnauthorizedException)
	})

	it('should allow when the header matches the configured secret', () => {
		configGet.mockReturnValue('top-secret')

		expect(guard.canActivate(createContext({ 'x-internal-secret': 'top-secret' }))).toBe(true)
	})

	it('should reject an empty configured secret even if the header is empty too', () => {
		configGet.mockReturnValue('')

		expect(() => guard.canActivate(createContext({ 'x-internal-secret': '' })))
			.toThrow(UnauthorizedException)
	})
})
