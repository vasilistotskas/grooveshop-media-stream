import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { describe, expect, it } from 'vitest'
import { AppConfigDto } from '#microservice/Config/dto/app-config.dto'
import 'reflect-metadata'

describe('appConfigDto', () => {
	describe('validation', () => {
		it('should validate with default values', async () => {
			const dto = new AppConfigDto()
			const errors = await validate(dto)
			expect(errors).toHaveLength(0)
		})

		it('should validate with valid configuration', async () => {
			const validConfig = {
				server: {
					port: 3003,
					host: '0.0.0.0',
					cors: {
						origin: '*',
						methods: 'GET',
						maxAge: 86400,
					},
				},
				cache: {
					memory: {
						maxSize: 104857600,
						defaultTtl: 3600,
						checkPeriod: 600,
						maxKeys: 1000,
						warningThreshold: 80,
					},
					redis: {
						host: 'localhost',
						port: 6379,
						db: 0,
						ttl: 7200,
						maxRetries: 3,
						retryDelayOnFailover: 100,
						healthCheckCacheTtl: 10000,
					},
					file: {
						directory: './storage',
					},
					warming: {
						enabled: true,
						warmupOnStart: true,
						maxFilesToWarm: 50,
						warmupCron: '0 */6 * * *',
						popularImageThreshold: 5,
						baseTtl: 3600,
					},
					preloading: {
						enabled: false,
						interval: 300000,
					},
					image: {
						publicTtl: 31104000,
						privateTtl: 15552000,
						negativeCacheTtl: 300,
					},
				},
				processing: {
					cpuCores: 1.5,
				},
				monitoring: {
					enabled: true,
					// Production-scale intervals (30-min system / 10-min performance):
					// these previously exceeded a spurious @Max and crashed startup.
					systemMetricsInterval: 1800000,
					performanceMetricsInterval: 600000,
				},
				externalServices: {
					requestTimeout: 30000,
				},
				validation: {
					allowedDomains: ['localhost', 'webside.gr'],
					maxStringLength: 10000,
				},
				storage: {
					maxSize: 1073741824,
					maxFileAge: 30,
					warningSize: 838860800,
					criticalSize: 1073741824,
					warningFileCount: 5000,
					criticalFileCount: 10000,
					cleanup: {
						enabled: true,
						cronSchedule: '0 2 * * *',
						dryRun: false,
						maxDuration: 300000,
					},
					eviction: {
						strategy: 'intelligent',
						aggressiveness: 'moderate',
						preservePopular: true,
						minAccessCount: 5,
						maxFileAge: 7,
					},
					optimization: {
						enabled: true,
						strategies: ['deduplication'],
						popularThreshold: 10,
						compressionLevel: 6,
						createBackups: false,
						maxTime: 600000,
					},
				},
				shutdown: {
					timeout: 30000,
					forceTimeout: 60000,
				},
			}

			const dto = plainToInstance(AppConfigDto, validConfig)
			const errors = await validate(dto)
			expect(errors).toHaveLength(0)
		})

		it('should fail validation with invalid server port', async () => {
			const invalidConfig = {
				server: {
					port: -1,
					host: '0.0.0.0',
				},
			}

			const dto = plainToInstance(AppConfigDto, invalidConfig)
			const errors = await validate(dto)
			expect(errors.length).toBeGreaterThan(0)

			const serverError = errors.find(error => error.property === 'server')
			expect(serverError).toBeDefined()
		})

		it('should fail validation with invalid cache configuration', async () => {
			const invalidConfig = {
				cache: {
					memory: {
						maxSize: -1,
						defaultTtl: 0,
					},
				},
			}

			const dto = plainToInstance(AppConfigDto, invalidConfig)
			const errors = await validate(dto)
			expect(errors.length).toBeGreaterThan(0)
		})

		it('should fail validation with invalid external services timeout', async () => {
			const invalidConfig = {
				externalServices: {
					requestTimeout: -1000, // Invalid: below minimum
				},
			}

			const dto = plainToInstance(AppConfigDto, invalidConfig, {
				enableImplicitConversion: true,
				excludeExtraneousValues: false,
			})
			const errors = await validate(dto, {
				whitelist: false,
				forbidNonWhitelisted: false,
			})
			expect(errors.length).toBeGreaterThan(0)

			const externalServicesError = errors.find(error => error.property === 'externalServices')
			expect(externalServicesError).toBeDefined()
			expect(externalServicesError?.children).toBeDefined()
			expect(externalServicesError?.children?.length).toBeGreaterThan(0)
		})

		it('should fail validation with an unknown eviction strategy', async () => {
			const invalidConfig = {
				storage: {
					eviction: {
						strategy: 'random',
					},
				},
			}

			const dto = plainToInstance(AppConfigDto, invalidConfig)
			const errors = await validate(dto)
			expect(errors.length).toBeGreaterThan(0)

			const storageError = errors.find(error => error.property === 'storage')
			expect(storageError).toBeDefined()
		})
	})

	describe('transformation', () => {
		it('should transform string values to appropriate types with implicit conversion', async () => {
			// The schema-built config is already typed, but implicit conversion
			// keeps DTO validation tolerant of plain string input.
			const stringConfig = {
				server: {
					port: '3003',
					cors: {
						maxAge: '86400',
					},
				},
				cache: {
					memory: {
						maxSize: '104857600',
						defaultTtl: '3600',
					},
				},
			}

			const dto = plainToInstance(AppConfigDto, stringConfig, {
				enableImplicitConversion: true,
			})

			expect(typeof dto.server.port).toBe('number')
			expect(dto.server.port).toBe(3003)
			expect(typeof dto.server.cors.maxAge).toBe('number')
			expect(dto.server.cors.maxAge).toBe(86400)
			expect(typeof dto.cache.memory.maxSize).toBe('number')
			expect(dto.cache.memory.maxSize).toBe(104857600)
		})
	})
})
