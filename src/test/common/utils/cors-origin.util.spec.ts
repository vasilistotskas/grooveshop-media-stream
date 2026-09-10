import type { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface'
import { describe, expect, it, vi } from 'vitest'
import { buildCorsOrigin, parseHttpOrigin } from '#microservice/common/utils/cors-origin.util'

const PLATFORM = ['https://platform.example', 'https://assets.example']

function decide(origin: ReturnType<typeof buildCorsOrigin>, requestOrigin: string | undefined): boolean | undefined {
	expect(typeof origin).toBe('function')
	let decision: boolean | undefined
	;(origin as CustomOrigin)(requestOrigin, (error, allow) => {
		expect(error).toBeNull()
		decision = allow as boolean
	})
	return decision
}

describe('parseHttpOrigin', () => {
	it('normalises an http(s) origin to scheme://host[:port]', () => {
		expect(parseHttpOrigin('HTTPS://Store.Example/some/path?x=1')).toBe('https://store.example')
		expect(parseHttpOrigin('http://localhost:3000')).toBe('http://localhost:3000')
	})

	it('rejects anything that is not an http(s) origin', () => {
		expect(parseHttpOrigin('null')).toBeUndefined()
		expect(parseHttpOrigin('store.example')).toBeUndefined()
		expect(parseHttpOrigin('ftp://store.example')).toBeUndefined()
		expect(parseHttpOrigin('')).toBeUndefined()
	})
})

describe('buildCorsOrigin', () => {
	it('short-circuits to the wildcard when the static list contains *', () => {
		expect(buildCorsOrigin(['*'], () => false)).toBe('*')
	})

	it('allows a platform origin from the static list, case-insensitively', () => {
		const origin = buildCorsOrigin(PLATFORM, () => false)
		expect(decide(origin, 'https://platform.example')).toBe(true)
		expect(decide(origin, 'HTTPS://ASSETS.EXAMPLE')).toBe(true)
	})

	it('allows any origin whose hostname is an active tenant domain', () => {
		const isTenant = vi.fn((hostname: string) => hostname === 'store.example')
		const origin = buildCorsOrigin(PLATFORM, isTenant)
		expect(decide(origin, 'https://store.example')).toBe(true)
		expect(isTenant).toHaveBeenCalledWith('store.example')
	})

	it('refuses an origin that is neither platform nor tenant', () => {
		const origin = buildCorsOrigin(PLATFORM, () => false)
		expect(decide(origin, 'https://evil.example')).toBe(false)
	})

	it('refuses a request with no Origin, an opaque origin, or a non-http scheme', () => {
		const isTenant = vi.fn(() => true)
		const origin = buildCorsOrigin(PLATFORM, isTenant)
		expect(decide(origin, undefined)).toBe(false)
		expect(decide(origin, 'null')).toBe(false)
		expect(decide(origin, 'ftp://store.example')).toBe(false)
		expect(isTenant).not.toHaveBeenCalled()
	})

	it('matches the whole origin, never a substring of it', () => {
		const origin = buildCorsOrigin(PLATFORM, () => false)
		expect(decide(origin, 'https://platform.example.evil')).toBe(false)
		expect(decide(origin, 'http://platform.example')).toBe(false)
	})
})
