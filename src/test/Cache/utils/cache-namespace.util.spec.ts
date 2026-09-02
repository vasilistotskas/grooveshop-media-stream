import { describe, expect, it } from 'vitest'
import {
	cacheKey,
	IMAGE_KEY_PATTERN,
	imageNamespace,
	keyNamespacePrefix,
	tenantFromNamespace,
} from '#microservice/Cache/utils/cache-namespace.util'

describe('cache-namespace.util', () => {
	it('builds the per-tenant namespace and falls back to public', () => {
		expect(imageNamespace('acme')).toBe('image:acme')
		expect(imageNamespace()).toBe('image:public')
		expect(imageNamespace('')).toBe('image:public')
		expect(imageNamespace(null)).toBe('image:public')
	})

	it('joins namespace and identifier', () => {
		expect(cacheKey('image:acme', 'abc')).toBe('image:acme:abc')
		expect(cacheKey('image:acme', '')).toBe('image:acme:')
	})

	it('extracts the tenant from a namespace', () => {
		expect(tenantFromNamespace('image:acme')).toBe('acme')
		expect(tenantFromNamespace('image:public')).toBe('public')
		expect(tenantFromNamespace('ratelimit')).toBe('public')
		expect(tenantFromNamespace('image:')).toBe('public')
	})

	it('derives the namespace prefix of a key', () => {
		expect(keyNamespacePrefix('image:acme:uuid')).toBe('image:acme:')
		expect(keyNamespacePrefix('image:acme')).toBeNull()
		expect(keyNamespacePrefix('plain')).toBeNull()
	})

	it('exposes the SCAN pattern for every image entry', () => {
		expect(IMAGE_KEY_PATTERN).toBe('image:*')
	})
})
