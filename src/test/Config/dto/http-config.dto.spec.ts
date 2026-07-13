import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import {
	CircuitBreakerConfigDto,
	ConnectionPoolConfigDto,
	HttpConfigDto,
	HttpHealthCheckConfigDto,
} from '#microservice/Config/dto/http-config.dto'
import 'reflect-metadata'

describe('hTTP Config DTOs', () => {
	describe('circuitBreakerConfigDto', () => {
		it('should use schema-aligned default values', () => {
			const config = new CircuitBreakerConfigDto()

			expect(config.enabled).toBe(true)
			expect(config.failureThreshold).toBe(50)
			expect(config.resetTimeout).toBe(30000)
			expect(config.monitoringPeriod).toBe(60000)
			expect(config.minimumRequests).toBe(10)
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
	})

	describe('connectionPoolConfigDto', () => {
		it('should use schema-aligned default values', () => {
			const config = new ConnectionPoolConfigDto()

			expect(config.maxSockets).toBe(50)
			expect(config.keepAliveMsecs).toBe(1000)
		})

		it('should validate minimum values', async () => {
			const config = new ConnectionPoolConfigDto()
			config.maxSockets = 0
			config.keepAliveMsecs = 50

			const errors = await validate(config)

			expect(errors).toHaveLength(2)
			expect(errors.some(error => error.property === 'maxSockets')).toBe(true)
			expect(errors.some(error => error.property === 'keepAliveMsecs')).toBe(true)
		})
	})

	describe('httpHealthCheckConfigDto', () => {
		it('should default to no probe URLs', () => {
			const config = new HttpHealthCheckConfigDto()

			expect(config.urls).toEqual([])
			expect(config.timeout).toBe(5000)
		})

		it('should reject non-string URL entries', async () => {
			const config = plainToInstance(HttpHealthCheckConfigDto, { urls: [42] })
			const errors = await validate(config)

			expect(errors.some(error => error.property === 'urls')).toBe(true)
		})
	})

	describe('httpConfigDto', () => {
		it('should use schema-aligned default values', () => {
			const config = new HttpConfigDto()

			expect(config.timeout).toBe(30000)
			expect(config.maxRetries).toBe(3)
			expect(config.retryDelay).toBe(1000)
			expect(config.maxRetryDelay).toBe(10000)
			expect(config.circuitBreaker).toBeInstanceOf(CircuitBreakerConfigDto)
			expect(config.connectionPool).toBeInstanceOf(ConnectionPoolConfigDto)
			expect(config.healthCheck).toBeInstanceOf(HttpHealthCheckConfigDto)
		})

		it('should validate a complete valid config', async () => {
			const config = plainToInstance(HttpConfigDto, {
				timeout: 30000,
				maxRetries: 3,
				retryDelay: 1000,
				maxRetryDelay: 10000,
				connectionPool: { maxSockets: 50, keepAliveMsecs: 1000 },
				circuitBreaker: {
					enabled: true,
					failureThreshold: 50,
					resetTimeout: 30000,
					monitoringPeriod: 60000,
					minimumRequests: 10,
				},
				healthCheck: { urls: ['http://localhost:8000/health'], timeout: 5000 },
			})

			const errors = await validate(config)
			expect(errors).toHaveLength(0)
		})

		it('should reject out-of-range top-level values', async () => {
			const config = plainToInstance(HttpConfigDto, {
				timeout: 500, // below Min(1000)
				maxRetries: 20, // above Max(10)
				retryDelay: 10, // below Min(100)
			})

			const errors = await validate(config)

			expect(errors.some(error => error.property === 'timeout')).toBe(true)
			expect(errors.some(error => error.property === 'maxRetries')).toBe(true)
			expect(errors.some(error => error.property === 'retryDelay')).toBe(true)
		})

		it('should surface nested circuit-breaker violations', async () => {
			const config = plainToInstance(HttpConfigDto, {
				circuitBreaker: { failureThreshold: 0 },
			})

			const errors = await validate(config)
			const cbError = errors.find(error => error.property === 'circuitBreaker')

			expect(cbError).toBeDefined()
			expect(cbError?.children?.length).toBeGreaterThan(0)
		})
	})
})
