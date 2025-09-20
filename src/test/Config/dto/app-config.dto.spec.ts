import { AppConfigDto } from '@microservice/Config/dto/app-config.dto'
import { plainToClass } from 'class-transformer'
import { validate } from 'class-validator'
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
						ttl: 3600,
						checkPeriod: 600,
					},
					redis: {
						host: 'localhost',
						port: 6379,
						db: 0,
						ttl: 7200,
						maxRetries: 3,
						retryDelayOnFailover: 100,
					},
					file: {
						directory: './storage',
						maxSize: 1073741824,
						cleanupInterval: 3600,
					},
				},
				processing: {
					maxConcurrent: 10,
					timeout: 30000,
					retries: 3,
					maxFileSize: 10485760,
					allowedFormats: ['jpg', 'jpeg', 'png', 'webp'],
				},
				monitoring: {
					enabled: true,
					metricsPort: 9090,
					healthPath: '/health',
					metricsPath: '/metrics',
				},
				externalServices: {
					djangoUrl: 'http://localhost:8000',
					nuxtUrl: 'http://localhost:3000',
					requestTimeout: 30000,
					maxRetries: 3,
				},
			}

			const dto = plainToClass(AppConfigDto, validConfig)
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

			const dto = plainToClass(AppConfigDto, invalidConfig)
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
						ttl: 0,
					},
				},
			}

			const dto = plainToClass(AppConfigDto, invalidConfig)
			const errors = await validate(dto)
			expect(errors.length).toBeGreaterThan(0)
		})

		it('should fail validation with invalid external service URLs', async () => {
			const invalidConfig = {
				externalServices: {
					djangoUrl: 'invalid://url with spaces',
					nuxtUrl: 'not a url at all',
					requestTimeout: 30000,
					maxRetries: 3,
				},
			}

			const dto = plainToClass(AppConfigDto, invalidConfig, {
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
	})

	describe('transformation', () => {
		it('should transform string values to appropriate types', async () => {
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
						ttl: '3600',
					},
				},
				monitoring: {
					enabled: 'true',
					metricsPort: '9090',
				},
			}

			const dto = plainToClass(AppConfigDto, stringConfig, {
				enableImplicitConversion: true,
			})

			expect(typeof dto.server.port).toBe('number')
			expect(dto.server.port).toBe(3003)
			expect(typeof dto.server.cors.maxAge).toBe('number')
			expect(dto.server.cors.maxAge).toBe(86400)
			expect(typeof dto.cache.memory.maxSize).toBe('number')
			expect(dto.cache.memory.maxSize).toBe(104857600)
			expect(typeof dto.monitoring.enabled).toBe('boolean')
			expect(dto.monitoring.enabled).toBe(true)
		})

		it('should handle comma-separated allowed formats', async () => {
			const configWithFormats = {
				processing: {
					allowedFormats: 'jpg,jpeg,png,webp,gif',
				},
			}

			const dto = plainToClass(AppConfigDto, configWithFormats, {
				enableImplicitConversion: true,
			})

			expect(Array.isArray(dto.processing.allowedFormats)).toBe(true)
			expect(dto.processing.allowedFormats).toEqual(['jpg', 'jpeg', 'png', 'webp', 'gif'])
		})
	})
})
