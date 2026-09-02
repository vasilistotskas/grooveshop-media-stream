import { describe, expect, it } from 'vitest'
import { errorMessage } from '#microservice/common/utils/error-message.util'

describe('errorMessage', () => {
	it('returns the message of an Error', () => {
		expect(errorMessage(new TypeError('boom'))).toBe('boom')
	})

	it('stringifies non-Error values', () => {
		expect(errorMessage('plain string')).toBe('plain string')
		expect(errorMessage(42)).toBe('42')
		expect(errorMessage(undefined)).toBe('undefined')
		expect(errorMessage(null)).toBe('null')
	})
})
