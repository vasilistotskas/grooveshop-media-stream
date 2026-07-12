import type { MockedObject } from 'vitest'
import { ConfigService as NestConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfigService } from '#microservice/Config/config.service'
import 'reflect-metadata'

describe('configService', () => {
	let service: ConfigService
	let nestConfigService: MockedObject<NestConfigService>

	const mockEnvVars = {
		PORT: '3003',
		HOST: '0.0.0.0',
		CORS_ORIGIN: '*',
		CORS_METHODS: 'GET',
		CORS_MAX_AGE: '86400',
		CACHE_MEMORY_MAX_SIZE: '104857600',
		CACHE_MEMORY_DEFAULT_TTL: '3600',
		CACHE_MEMORY_CHECK_PERIOD: '600',
		REDIS_HOST: 'localhost',
		REDIS_PORT: '6379',
		REDIS_DB: '0',
		REDIS_TTL: '7200',
		REDIS_MAX_RETRIES: '3',
		REDIS_RETRY_DELAY: '100',
		CACHE_FILE_DIRECTORY: './storage',
		CACHE_IMAGE_NEGATIVE_TTL: '600',
		PROCESSING_CPU_CORES: '1.5',
		MONITORING_ENABLED: 'true',
		BACKEND_URL: 'http://localhost:8000',
		EXTERNAL_REQUEST_TIMEOUT: '30000',
		RATE_LIMIT_ENABLED: 'true',
		RATE_LIMIT_DEFAULT_WINDOW_MS: '60000',
		RATE_LIMIT_DEFAULT_MAX: '100',
		RATE_LIMIT_IMAGE_PROCESSING_WINDOW_MS: '60000',
		RATE_LIMIT_IMAGE_PROCESSING_MAX: '50',
		RATE_LIMIT_HEALTH_CHECK_WINDOW_MS: '10000',
		RATE_LIMIT_HEALTH_CHECK_MAX: '1000',
		RATE_LIMIT_BYPASS_HEALTH_CHECKS: 'true',
		RATE_LIMIT_BYPASS_METRICS_ENDPOINT: 'true',
		RATE_LIMIT_BYPASS_STATIC_ASSETS: 'true',
		RATE_LIMIT_BYPASS_WHITELISTED_DOMAINS: '',
	}

	beforeEach(async () => {
		const mockNestConfigService = {
			get: vi.fn((key: string) => mockEnvVars[key as keyof typeof mockEnvVars]),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ConfigService,
				{
					provide: NestConfigService,
					useValue: mockNestConfigService,
				},
			],
		}).compile()

		service = module.get<ConfigService>(ConfigService)
		nestConfigService = module.get(NestConfigService)
	})

	describe('configuration Loading', () => {
		it('should be defined', () => {
			expect(service).toBeDefined()
		})

		it('should load and validate configuration successfully', async () => {
			await expect(service.validate()).resolves.not.toThrow()
		})

		it('should get configuration values by key', () => {
			expect(service.get('server.port')).toBe(3003)
			expect(service.get('cache.memory.maxSize')).toBe(104857600)
			expect(service.get('monitoring.enabled')).toBe(true)
		})

		it('should get optional configuration values with defaults', () => {
			expect(service.getOptional('server.port', 8080)).toBe(3003)
			expect(service.getOptional('nonexistent.key' as any, 'default')).toBe('default')
		})

		it('should return entire configuration object', () => {
			const config = service.getAll()
			expect(config).toHaveProperty('server')
			expect(config).toHaveProperty('cache')
			expect(config).toHaveProperty('processing')
			expect(config).toHaveProperty('monitoring')
			expect(config).toHaveProperty('externalServices')
			expect(config).toHaveProperty('validation')
			expect(config).toHaveProperty('storage')
		})

		it('should throw error for non-existent configuration key', () => {
			expect(() => service.get('nonexistent.key' as any)).toThrow(
				'Configuration key \'nonexistent.key\' not found',
			)
		})

		it('should apply CACHE_IMAGE_NEGATIVE_TTL from the environment', () => {
			// Regression: ensureConfigStructure() used to rebuild cache.image
			// without negativeCacheTtl, silently discarding the env value.
			expect(service.get('cache.image.negativeCacheTtl')).toBe(600)
		})

		it('should parse fractional numeric values', () => {
			expect(service.get('processing.cpuCores')).toBe(1.5)
		})
	})

	describe('configuration Validation', () => {
		it('should reject out-of-range server port', async () => {
			nestConfigService.get.mockImplementation((key: string) => {
				if (key === 'PORT')
					return '99999'
				return mockEnvVars[key as keyof typeof mockEnvVars]
			})

			const invalidService = new ConfigService(nestConfigService)
			await expect(invalidService.validate()).rejects.toThrow('Configuration validation failed')
		})

		it('should fall back to the schema default for unparseable numbers', async () => {
			nestConfigService.get.mockImplementation((key: string) => {
				if (key === 'PORT')
					return 'invalid-port'
				return mockEnvVars[key as keyof typeof mockEnvVars]
			})

			const fallbackService = new ConfigService(nestConfigService)
			expect(fallbackService.get('server.port')).toBe(3003)
			await expect(fallbackService.validate()).resolves.not.toThrow()
		})

		it('should validate cache configuration', async () => {
			nestConfigService.get.mockImplementation((key: string) => {
				if (key === 'CACHE_MEMORY_MAX_SIZE')
					return '-1'
				return mockEnvVars[key as keyof typeof mockEnvVars]
			})

			const invalidService = new ConfigService(nestConfigService)
			await expect(invalidService.validate()).rejects.toThrow('Configuration validation failed')
		})

		it('should validate processing configuration', async () => {
			nestConfigService.get.mockImplementation((key: string) => {
				if (key === 'PROCESSING_CPU_CORES')
					return '0'
				return mockEnvVars[key as keyof typeof mockEnvVars]
			})

			const invalidService = new ConfigService(nestConfigService)
			await expect(invalidService.validate()).rejects.toThrow('Configuration validation failed')
		})
	})

	describe('default Values', () => {
		it('should use default values when environment variables are not set', async () => {
			const emptyNestConfigService = {
				get: vi.fn(() => undefined),
			}

			const serviceWithDefaults = new ConfigService(emptyNestConfigService as any)

			expect(serviceWithDefaults.get('server.port')).toBe(3003)
			expect(serviceWithDefaults.get('server.host')).toBe('0.0.0.0')
			expect(serviceWithDefaults.get('cache.memory.maxSize')).toBe(104857600)
			expect(serviceWithDefaults.get('processing.cpuCores')).toBe(1.5)
			expect(serviceWithDefaults.get('monitoring.enabled')).toBe(true)
			expect(serviceWithDefaults.get('cache.image.negativeCacheTtl')).toBe(300)
			expect(serviceWithDefaults.get('storage.cleanup.cronSchedule')).toBe('0 2 * * *')
			expect(serviceWithDefaults.get('http.healthCheck.urls')).toEqual([])
			await expect(serviceWithDefaults.validate()).resolves.not.toThrow()
		})
	})

	describe('type Safety', () => {
		it('should maintain type safety for configuration values', () => {
			const port: number = service.get('server.port')
			const enabled: boolean = service.get('monitoring.enabled')
			const domains: string[] = service.get('validation.allowedDomains')

			expect(typeof port).toBe('number')
			expect(typeof enabled).toBe('boolean')
			expect(Array.isArray(domains)).toBe(true)
			expect(domains.every(domain => typeof domain === 'string')).toBe(true)
		})
	})
})
