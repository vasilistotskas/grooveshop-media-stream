import { DefaultCacheKeyStrategy } from '#microservice/Cache/strategies/cache-key.strategy'
import { beforeEach, describe, expect, it } from 'vitest'

describe('defaultCacheKeyStrategy', () => {
	let strategy: DefaultCacheKeyStrategy

	beforeEach(() => {
		strategy = new DefaultCacheKeyStrategy()
	})

	describe('generateKey', () => {
		it('should generate key with namespace and identifier', () => {
			const key = strategy.generateKey('images', 'test-image')
			expect(key).toBe('images:test-image')
		})

		it('should include hashed parameters when provided', () => {
			const key = strategy.generateKey('images', 'test-image', { width: 100, height: 200 })
			expect(key).toMatch(/^images:test-image:[a-f0-9]{16}$/)
		})

		it('should generate consistent keys for same parameters', () => {
			const key1 = strategy.generateKey('images', 'test-image', { width: 100, height: 200 })
			const key2 = strategy.generateKey('images', 'test-image', { width: 100, height: 200 })
			expect(key1).toBe(key2)
		})

		it('should generate consistent keys regardless of parameter order', () => {
			const key1 = strategy.generateKey('images', 'test-image', { width: 100, height: 200 })
			const key2 = strategy.generateKey('images', 'test-image', { height: 200, width: 100 })
			expect(key1).toBe(key2)
		})

		it('should generate different keys for different parameters', () => {
			const key1 = strategy.generateKey('images', 'test-image', { width: 100, height: 200 })
			const key2 = strategy.generateKey('images', 'test-image', { width: 150, height: 200 })
			expect(key1).not.toBe(key2)
		})

		it('should handle empty parameters object', () => {
			const key = strategy.generateKey('images', 'test-image', {})
			expect(key).toBe('images:test-image')
		})
	})

	describe('parseKey', () => {
		it('should parse simple key', () => {
			const parsed = strategy.parseKey('images:test-image')
			expect(parsed).toEqual({
				namespace: 'images',
				identifier: 'test-image',
				params: undefined,
			})
		})

		it('should parse key with hash', () => {
			const parsed = strategy.parseKey('images:test-image:abc123def456')
			expect(parsed).toEqual({
				namespace: 'images',
				identifier: 'test-image',
				params: { hash: 'abc123def456' },
			})
		})

		it('should throw error for invalid key format', () => {
			expect(() => strategy.parseKey('invalid-key')).toThrow('Invalid cache key format')
		})
	})

	describe('generateHash', () => {
		it('should generate consistent hash for same input', () => {
			const hash1 = strategy.generateHash('test-input')
			const hash2 = strategy.generateHash('test-input')
			expect(hash1).toBe(hash2)
		})

		it('should generate different hashes for different inputs', () => {
			const hash1 = strategy.generateHash('test-input-1')
			const hash2 = strategy.generateHash('test-input-2')
			expect(hash1).not.toBe(hash2)
		})

		it('should generate 16-character hash', () => {
			const hash = strategy.generateHash('test-input')
			expect(hash).toHaveLength(16)
			expect(hash).toMatch(/^[a-f0-9]{16}$/)
		})
	})
})
