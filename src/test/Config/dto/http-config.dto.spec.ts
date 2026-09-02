import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { APP_CONFIG_SCHEMA, buildConfigFromSchema } from '#microservice/common/utils/config-schema.util'
import {
	CircuitBreakerConfigDto,
	ConnectionPoolConfigDto,
	HttpConfigDto,
	HttpHealthCheckConfigDto,
} from '#microservice/Config/dto/http-config.dto'
import 'reflect-metadata'

/** A fresh copy of the schema-default `http` group. */
function httpDefaults(): Record<string, any> {
	return buildConfigFromSchema<{ http: Record<string, any> }>(() => undefined, APP_CONFIG_SCHEMA).http
}

describe('hTTP Config DTOs', () => {
	describe('circuitBreakerConfigDto', () => {
		it('should validate minimum values', async () => {
			const config = plainToInstance(CircuitBreakerConfigDto, {
				...httpDefaults().circuitBreaker,
				failureThreshold: 0,
				resetTimeout: 500,
				monitoringPeriod: 500,
			})

			const errors = await validate(config)

			expect(errors).toHaveLength(3)
			expect(errors.some(error => error.property === 'failureThreshold')).toBe(true)
			expect(errors.some(error => error.property === 'resetTimeout')).toBe(true)
			expect(errors.some(error => error.property === 'monitoringPeriod')).toBe(true)
		})
	})

	describe('connectionPoolConfigDto', () => {
		it('should validate minimum values', async () => {
			const config = plainToInstance(ConnectionPoolConfigDto, {
				...httpDefaults().connectionPool,
				maxSockets: 0,
				keepAliveMsecs: 50,
			})

			const errors = await validate(config)

			expect(errors).toHaveLength(2)
			expect(errors.some(error => error.property === 'maxSockets')).toBe(true)
			expect(errors.some(error => error.property === 'keepAliveMsecs')).toBe(true)
		})
	})

	describe('httpHealthCheckConfigDto', () => {
		it('should reject non-string URL entries', async () => {
			const config = plainToInstance(HttpHealthCheckConfigDto, { ...httpDefaults().healthCheck, urls: [42] })

			const errors = await validate(config)

			expect(errors.some(error => error.property === 'urls')).toBe(true)
		})
	})

	describe('httpConfigDto', () => {
		it('should validate a complete valid config', async () => {
			const config = plainToInstance(HttpConfigDto, {
				...httpDefaults(),
				healthCheck: { urls: ['http://localhost:8000/health'], timeout: 5000 },
			})

			const errors = await validate(config)

			expect(errors).toHaveLength(0)
		})

		it('should reject out-of-range top-level values', async () => {
			const config = plainToInstance(HttpConfigDto, {
				...httpDefaults(),
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
			const plain = httpDefaults()
			plain.circuitBreaker.failureThreshold = 0

			const errors = await validate(plainToInstance(HttpConfigDto, plain))
			const cbError = errors.find(error => error.property === 'circuitBreaker')

			expect(cbError).toBeDefined()
			expect(cbError?.children?.length).toBeGreaterThan(0)
		})

		it('should fail validation when a field is missing', async () => {
			const plain = httpDefaults()
			delete plain.timeout

			const errors = await validate(plainToInstance(HttpConfigDto, plain))
			const timeoutError = errors.find(error => error.property === 'timeout')

			expect(timeoutError?.constraints).toMatchObject({ isNumber: expect.stringContaining('must be a number') })
		})
	})
})
