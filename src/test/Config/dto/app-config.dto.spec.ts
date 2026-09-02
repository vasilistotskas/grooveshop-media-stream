import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { APP_CONFIG_SCHEMA, buildConfigFromSchema } from '#microservice/common/utils/config-schema.util'
import { AppConfigDto } from '#microservice/Config/dto/app-config.dto'
import 'reflect-metadata'

/** A fresh, complete plain config built from the schema defaults. */
function schemaDefaults(): Record<string, any> {
	return buildConfigFromSchema<Record<string, any>>(() => undefined, APP_CONFIG_SCHEMA)
}

function validateConfig(plain: Record<string, any>) {
	return validate(plainToInstance(AppConfigDto, plain))
}

describe('appConfigDto', () => {
	describe('validation', () => {
		it('should accept the schema defaults', async () => {
			const errors = await validateConfig(schemaDefaults())

			expect(errors).toHaveLength(0)
		})

		it('should accept production-scale monitoring intervals', async () => {
			// 30-min system / 10-min performance intervals: a spurious @Max once
			// rejected these and crashed startup.
			const plain = schemaDefaults()
			plain.monitoring.systemMetricsInterval = 1800000
			plain.monitoring.performanceMetricsInterval = 600000

			const errors = await validateConfig(plain)

			expect(errors).toHaveLength(0)
		})

		it('should fail validation with invalid server port', async () => {
			const plain = schemaDefaults()
			plain.server.port = -1

			const errors = await validateConfig(plain)

			expect(errors.length).toBeGreaterThan(0)
			expect(errors.find(error => error.property === 'server')).toBeDefined()
		})

		it('should fail validation with invalid cache configuration', async () => {
			const plain = schemaDefaults()
			plain.cache.memory.maxSize = -1
			plain.cache.memory.defaultTtl = 0

			const errors = await validateConfig(plain)

			expect(errors.length).toBeGreaterThan(0)
			expect(errors.find(error => error.property === 'cache')).toBeDefined()
		})

		it('should fail validation with a zero eviction access threshold', async () => {
			const plain = schemaDefaults()
			plain.storage.eviction.minAccessCount = 0

			const errors = await validateConfig(plain)

			expect(errors.length).toBeGreaterThan(0)
			expect(errors.find(error => error.property === 'storage')).toBeDefined()
		})

		it('should fail validation when a leaf field is missing', async () => {
			const plain = schemaDefaults()
			delete plain.shutdown.timeout

			const errors = await validateConfig(plain)
			const shutdownError = errors.find(error => error.property === 'shutdown')
			const timeoutError = shutdownError?.children?.find(child => child.property === 'timeout')

			expect(timeoutError?.constraints).toMatchObject({ isNumber: expect.stringContaining('must be a number') })
		})

		it('should fail validation when a group is missing', async () => {
			const plain = schemaDefaults()
			delete plain.http

			const errors = await validateConfig(plain)

			expect(errors.find(error => error.property === 'http')).toBeDefined()
		})
	})
})
