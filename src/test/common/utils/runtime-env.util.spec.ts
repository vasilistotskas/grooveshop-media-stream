import { afterEach, describe, expect, it, vi } from 'vitest'
import { isProduction, isTest, nodeEnv } from '#microservice/common/utils/runtime-env.util'

describe('runtime-env.util', () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it('defaults to development when NODE_ENV is unset', () => {
		vi.stubEnv('NODE_ENV', undefined)
		expect(nodeEnv()).toBe('development')
		expect(isProduction()).toBe(false)
		expect(isTest()).toBe(false)
	})

	it('reports production', () => {
		vi.stubEnv('NODE_ENV', 'production')
		expect(isProduction()).toBe(true)
		expect(isTest()).toBe(false)
	})

	it('reports test and reads the value per call', () => {
		vi.stubEnv('NODE_ENV', 'test')
		expect(isTest()).toBe(true)
		vi.stubEnv('NODE_ENV', 'production')
		expect(isTest()).toBe(false)
	})
})
