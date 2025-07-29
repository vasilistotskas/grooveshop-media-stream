import { ConfigService } from '@microservice/Config/config.service'
import { ConfigService as NestConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import 'reflect-metadata'

describe('configService', () => {
	let service: ConfigService
	let nestConfigService: jest.Mocked<NestConfigService>

	const mockEnvVars = {
		PORT: '3003',
		HOST: '0.0.0.0',
		CORS_ORIGIN: '*',
		CORS_METHODS: 'GET',
		CORS_MAX_AGE: '86400',
		CACHE_MEMORY_MAX_SIZE: '104857600',
		CACHE_MEMORY_TTL: '3600',
		CACHE_MEMORY_CHECK_PERIOD: '600',
		REDIS_HOST: 'localhost',
		REDIS_PORT: '6379',
		REDIS_DB: '0',
		REDIS_TTL: '7200',
		REDIS_MAX_RETRIES: '3',
		REDIS_RETRY_DELAY: '100',
		CACHE_FILE_DIRECTORY: './storage',
		CACHE_FILE_MAX_SIZE: '1073741824',
		CACHE_FILE_CLEANUP_INTERVAL: '3600',
		PROCESSING_MAX_CONCURRENT: '10',
		PROCESSING_TIMEOUT: '30000',
		PROCESSING_RETRIES: '3',
		PROCESSING_MAX_FILE_SIZE: '10485760',
		PROCESSING_ALLOWED_FORMATS: 'jpg,jpeg,png,webp,gif,svg',
		MONITORING_ENABLED: 'true',
		MONITORING_METRICS_PORT: '9090',
		MONITORING_HEALTH_PATH: '/health',
		MONITORING_METRICS_PATH: '/metrics',
		NEST_PUBLIC_DJANGO_URL: 'http://localhost:8000',
		NEST_PUBLIC_NUXT_URL: 'http://localhost:3000',
		EXTERNAL_REQUEST_TIMEOUT: '30000',
		EXTERNAL_MAX_RETRIES: '3',
	}

	beforeEach(async () => {
		const mockNestConfigService = {
			get: jest.fn((key: string) => mockEnvVars[key as keyof typeof mockEnvVars]),
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
		})

		it('should throw error for non-existent configuration key', () => {
			expect(() => service.get('nonexistent.key' as any)).toThrow(
				'Configuration key \'nonexistent.key\' not found',
			)
		})
	})

	describe('configuration Validation', () => {
		it('should validate server configuration', async () => {
			nestConfigService.get.mockImplementation((key: string) => {
				if (key === 'PORT')
					return 'invalid-port'
				return mockEnvVars[key as keyof typeof mockEnvVars]
			})

			const invalidService = new ConfigService(nestConfigService)
			await expect(invalidService.validate()).rejects.toThrow('Configuration validation failed')
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
				if (key === 'PROCESSING_MAX_CONCURRENT')
					return '0'
				return mockEnvVars[key as keyof typeof mockEnvVars]
			})

			const invalidService = new ConfigService(nestConfigService)
			await expect(invalidService.validate()).rejects.toThrow('Configuration validation failed')
		})

		it('should validate external services URLs', async () => {
			nestConfigService.get.mockImplementation((key: string) => {
				if (key === 'NEST_PUBLIC_DJANGO_URL')
					return 'invalid://url with spaces'
				return mockEnvVars[key as keyof typeof mockEnvVars]
			})

			const invalidService = new ConfigService(nestConfigService)
			await expect(invalidService.validate()).rejects.toThrow('Configuration validation failed')
		})
	})

	describe('hot Reload Functionality', () => {
		it('should identify hot-reloadable keys', () => {
			expect(service.isHotReloadable('MONITORING_ENABLED')).toBe(true)
			expect(service.isHotReloadable('PROCESSING_MAX_CONCURRENT')).toBe(true)
			expect(service.isHotReloadable('CACHE_MEMORY_TTL')).toBe(true)
			expect(service.isHotReloadable('PORT')).toBe(false)
		})

		it('should reload hot-reloadable configuration', async () => {
			const originalEnabled = service.get('monitoring.enabled')

			// Mock environment change
			nestConfigService.get.mockImplementation((key: string) => {
				if (key === 'MONITORING_ENABLED')
					return 'false'
				return mockEnvVars[key as keyof typeof mockEnvVars]
			})

			await service.reload()

			// Should update hot-reloadable setting
			expect(service.get('monitoring.enabled')).toBe(false)
			expect(service.get('monitoring.enabled')).not.toBe(originalEnabled)
		})
	})

	describe('default Values', () => {
		it('should use default values when environment variables are not set', async () => {
			const emptyNestConfigService = {
				get: jest.fn(() => undefined),
			}

			const serviceWithDefaults = new ConfigService(emptyNestConfigService as any)

			expect(serviceWithDefaults.get('server.port')).toBe(3003)
			expect(serviceWithDefaults.get('server.host')).toBe('0.0.0.0')
			expect(serviceWithDefaults.get('cache.memory.maxSize')).toBe(104857600)
			expect(serviceWithDefaults.get('processing.maxConcurrent')).toBe(10)
			expect(serviceWithDefaults.get('monitoring.enabled')).toBe(true)
		})
	})

	describe('type Safety', () => {
		it('should maintain type safety for configuration values', () => {
			const port: number = service.get('server.port')
			const enabled: boolean = service.get('monitoring.enabled')
			const formats: string[] = service.get('processing.allowedFormats')

			expect(typeof port).toBe('number')
			expect(typeof enabled).toBe('boolean')
			expect(Array.isArray(formats)).toBe(true)
			expect(formats.every(format => typeof format === 'string')).toBe(true)
		})
	})
})
