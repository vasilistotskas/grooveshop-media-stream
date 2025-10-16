import {
	CircuitBreakerConfigDto,
	ConnectionPoolConfigDto,
	HttpConfigDto,
	RetryConfigDto,
} from '#microservice/Config/dto/http-config.dto'
import { plainToClass } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'

describe('hTTP Config DTOs', () => {
	describe('circuitBreakerConfigDto', () => {
		it('should use default values', () => {
			const config = new CircuitBreakerConfigDto()

			expect(config.enabled).toBe(false)
			expect(config.failureThreshold).toBe(5)
			expect(config.resetTimeout).toBe(60000)
			expect(config.monitoringPeriod).toBe(30000)
		})

		it('should transform string values correctly', () => {
			const plainObject = {
				enabled: 'true',
				failureThreshold: '10',
				resetTimeout: '120000',
				monitoringPeriod: '60000',
			}

			const config = plainToClass(CircuitBreakerConfigDto, plainObject)

			expect(config.enabled).toBe(true)
			expect(config.failureThreshold).toBe(10)
			expect(config.resetTimeout).toBe(120000)
			expect(config.monitoringPeriod).toBe(60000)
		})

		it('should handle boolean transformation for enabled field', () => {
			const testCases = [
				{ input: 'true', expected: true },
				{ input: true, expected: true },
				{ input: 'false', expected: false },
				{ input: false, expected: false },
				{ input: 'anything', expected: false },
				{ input: undefined, expected: false },
			]

			testCases.forEach(({ input, expected }) => {
				const config = plainToClass(CircuitBreakerConfigDto, { enabled: input })
				expect(config.enabled).toBe(expected)
			})
		})

		it('should use default values for invalid numbers', () => {
			const plainObject = {
				failureThreshold: 'invalid',
				resetTimeout: 'invalid',
				monitoringPeriod: 'invalid',
			}

			const config = plainToClass(CircuitBreakerConfigDto, plainObject)

			expect(config.failureThreshold).toBe(5)
			expect(config.resetTimeout).toBe(60000)
			expect(config.monitoringPeriod).toBe(30000)
		})

		it('should validate minimum values', async () => {
			const config = new CircuitBreakerConfigDto()
			config.failureThreshold = 0
			config.resetTimeout = 500
			config.monitoringPeriod = 500

			const errors = await validate(config)

			expect(errors).toHaveLength(3)
			expect(errors.some(error => error.property === 'failureThreshold')).toBe(true)
			expect(errors.some(error => error.property === 'resetTimeout')).toBe(true)
			expect(errors.some(error => error.property === 'monitoringPeriod')).toBe(true)
		})

		it('should pass validation with valid values', async () => {
			const config = new CircuitBreakerConfigDto()
			config.enabled = true
			config.failureThreshold = 10
			config.resetTimeout = 120000
			config.monitoringPeriod = 60000

			const errors = await validate(config)

			expect(errors).toHaveLength(0)
		})
	})

	describe('connectionPoolConfigDto', () => {
		it('should use default values', () => {
			const config = new ConnectionPoolConfigDto()

			expect(config.maxSockets).toBe(50)
			expect(config.maxFreeSockets).toBe(10)
			expect(config.timeout).toBe(30000)
			expect(config.keepAlive).toBe(true)
			expect(config.keepAliveMsecs).toBe(1000)
			expect(config.connectTimeout).toBe(5000)
		})

		it('should transform string values correctly', () => {
			const plainObject = {
				maxSockets: '100',
				maxFreeSockets: '20',
				timeout: '60000',
				keepAlive: 'true',
				keepAliveMsecs: '2000',
				connectTimeout: '10000',
			}

			const config = plainToClass(ConnectionPoolConfigDto, plainObject)

			expect(config.maxSockets).toBe(100)
			expect(config.maxFreeSockets).toBe(20)
			expect(config.timeout).toBe(60000)
			expect(config.keepAlive).toBe(true)
			expect(config.keepAliveMsecs).toBe(2000)
			expect(config.connectTimeout).toBe(10000)
		})

		it('should handle boolean transformation for keepAlive field', () => {
			const testCases = [
				{ input: 'true', expected: true },
				{ input: true, expected: true },
				{ input: 'false', expected: false },
				{ input: false, expected: false },
				{ input: undefined, expected: false },
			]

			testCases.forEach(({ input, expected }) => {
				const config = plainToClass(ConnectionPoolConfigDto, { keepAlive: input })
				expect(config.keepAlive).toBe(expected)
			})
		})

		it('should use default values for invalid numbers', () => {
			const plainObject = {
				maxSockets: 'invalid',
				maxFreeSockets: 'invalid',
				timeout: 'invalid',
				keepAliveMsecs: 'invalid',
				connectTimeout: 'invalid',
			}

			const config = plainToClass(ConnectionPoolConfigDto, plainObject)

			expect(config.maxSockets).toBe(50)
			expect(config.maxFreeSockets).toBe(10)
			expect(config.timeout).toBe(30000)
			expect(config.keepAliveMsecs).toBe(1000)
			expect(config.connectTimeout).toBe(5000)
		})

		it('should validate minimum values', async () => {
			const config = new ConnectionPoolConfigDto()
			config.maxSockets = 0
			config.maxFreeSockets = 0
			config.timeout = 50
			config.keepAliveMsecs = 50
			config.connectTimeout = 50

			const errors = await validate(config)

			expect(errors).toHaveLength(5)
			expect(errors.some(error => error.property === 'maxSockets')).toBe(true)
			expect(errors.some(error => error.property === 'maxFreeSockets')).toBe(true)
			expect(errors.some(error => error.property === 'timeout')).toBe(true)
			expect(errors.some(error => error.property === 'keepAliveMsecs')).toBe(true)
			expect(errors.some(error => error.property === 'connectTimeout')).toBe(true)
		})
	})

	describe('retryConfigDto', () => {
		it('should use default values', () => {
			const config = new RetryConfigDto()

			expect(config.retries).toBe(3)
			expect(config.retryDelay).toBe(1000)
			expect(config.retryDelayMultiplier).toBe(2)
			expect(config.maxRetryDelay).toBe(10000)
			expect(config.retryOnTimeout).toBe(true)
			expect(config.retryOnConnectionError).toBe(true)
		})

		it('should transform string values correctly', () => {
			const plainObject = {
				retries: '5',
				retryDelay: '2000',
				retryDelayMultiplier: '3',
				maxRetryDelay: '20000',
				retryOnTimeout: 'true',
				retryOnConnectionError: 'false',
			}

			const config = plainToClass(RetryConfigDto, plainObject)

			expect(config.retries).toBe(5)
			expect(config.retryDelay).toBe(2000)
			expect(config.retryDelayMultiplier).toBe(3)
			expect(config.maxRetryDelay).toBe(20000)
			expect(config.retryOnTimeout).toBe(true)
			expect(config.retryOnConnectionError).toBe(false)
		})

		it('should handle boolean transformations', () => {
			const testCases = [
				{ input: 'true', expected: true },
				{ input: true, expected: true },
				{ input: 'false', expected: false },
				{ input: false, expected: false },
				{ input: undefined, expected: false },
			]

			testCases.forEach(({ input, expected }) => {
				const config1 = plainToClass(RetryConfigDto, { retryOnTimeout: input })
				const config2 = plainToClass(RetryConfigDto, { retryOnConnectionError: input })
				expect(config1.retryOnTimeout).toBe(expected)
				expect(config2.retryOnConnectionError).toBe(expected)
			})
		})

		it('should use default values for invalid numbers', () => {
			const plainObject = {
				retries: 'invalid',
				retryDelay: 'invalid',
				retryDelayMultiplier: 'invalid',
				maxRetryDelay: 'invalid',
			}

			const config = plainToClass(RetryConfigDto, plainObject)

			expect(config.retries).toBe(3)
			expect(config.retryDelay).toBe(1000)
			expect(config.retryDelayMultiplier).toBe(2)
			expect(config.maxRetryDelay).toBe(10000)
		})

		it('should validate minimum values', async () => {
			const config = new RetryConfigDto()
			config.retries = -1
			config.retryDelay = 50
			config.retryDelayMultiplier = 0
			config.maxRetryDelay = 500

			const errors = await validate(config)

			expect(errors).toHaveLength(4)
			expect(errors.some(error => error.property === 'retries')).toBe(true)
			expect(errors.some(error => error.property === 'retryDelay')).toBe(true)
			expect(errors.some(error => error.property === 'retryDelayMultiplier')).toBe(true)
			expect(errors.some(error => error.property === 'maxRetryDelay')).toBe(true)
		})
	})

	describe('httpConfigDto', () => {
		it('should use default nested configurations', () => {
			const config = new HttpConfigDto()

			expect(config.circuitBreaker).toBeInstanceOf(CircuitBreakerConfigDto)
			expect(config.connectionPool).toBeInstanceOf(ConnectionPoolConfigDto)
			expect(config.retry).toBeInstanceOf(RetryConfigDto)
		})

		it('should transform nested objects correctly', () => {
			const plainObject = {
				circuitBreaker: {
					enabled: 'true',
					failureThreshold: '10',
				},
				connectionPool: {
					maxSockets: '100',
					keepAlive: 'false',
				},
				retry: {
					retries: '5',
					retryOnTimeout: 'false',
				},
			}

			const config = plainToClass(HttpConfigDto, plainObject)

			expect(config.circuitBreaker.enabled).toBe(true)
			expect(config.circuitBreaker.failureThreshold).toBe(10)
			expect(config.connectionPool.maxSockets).toBe(100)
			expect(config.connectionPool.keepAlive).toBe(false)
			expect(config.retry.retries).toBe(5)
			expect(config.retry.retryOnTimeout).toBe(false)
		})

		it('should validate nested configurations', async () => {
			const config = new HttpConfigDto()
			config.circuitBreaker.failureThreshold = 0
			config.connectionPool.maxSockets = 0
			config.retry.retries = -1

			const errors = await validate(config, { validationError: { target: false } })

			expect(errors).toHaveLength(3)
			expect(errors.some(error => error.property === 'circuitBreaker')).toBe(true)
			expect(errors.some(error => error.property === 'connectionPool')).toBe(true)
			expect(errors.some(error => error.property === 'retry')).toBe(true)
		})

		it('should pass validation with valid nested configurations', async () => {
			const config = new HttpConfigDto()
			config.circuitBreaker.enabled = true
			config.circuitBreaker.failureThreshold = 10
			config.connectionPool.maxSockets = 100
			config.retry.retries = 5

			const errors = await validate(config)

			expect(errors).toHaveLength(0)
		})
	})
})
