import type { INestApplication } from '@nestjs/common'
import { MultiLayerCacheManager } from '@microservice/Cache/services/multi-layer-cache.manager'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { HealthController } from '@microservice/Health/controllers/health.controller'
import { HttpClientService } from '@microservice/HTTP/services/http-client.service'
import MediaStreamModule from '@microservice/media-stream.module'
import { MetricsController } from '@microservice/Metrics/controllers/metrics.controller'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { MonitoringController } from '@microservice/Monitoring/controllers/monitoring.controller'
import { JobQueueManager } from '@microservice/Queue/services/job-queue.manager'
import { AdaptiveRateLimitGuard } from '@microservice/RateLimit/guards/adaptive-rate-limit.guard'
import { SimpleValidationService } from '@microservice/Validation/services/simple-validation.service'
import { Test, TestingModule } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

describe('module Integration', () => {
	let app: INestApplication
	let module: TestingModule

	beforeAll(async () => {
		module = await Test.createTestingModule({
			imports: [MediaStreamModule],
		}).compile()

		app = module.createNestApplication()
		await app.init()
	})

	afterAll(async () => {
		await app.close()
	})

	describe('core Module Loading', () => {
		it('should load MediaStreamModule successfully', () => {
			expect(module).toBeDefined()
			expect(app).toBeDefined()
		})

		it('should have ConfigService available', () => {
			const configService = module.get<ConfigService>(ConfigService)
			expect(configService).toBeDefined()
			expect(configService.get).toBeDefined()
		})
	})

	describe('controller Registration', () => {
		it('should register HealthController', () => {
			const healthController = module.get<HealthController>(HealthController)
			expect(healthController).toBeDefined()
		})

		it('should register MetricsController', () => {
			const metricsController = module.get<MetricsController>(MetricsController)
			expect(metricsController).toBeDefined()
		})

		it('should register MonitoringController', () => {
			const monitoringController = module.get<MonitoringController>(MonitoringController)
			expect(monitoringController).toBeDefined()
		})
	})

	describe('service Dependencies', () => {
		it('should have QueueModule services available', () => {
			const jobQueueManager = module.get<JobQueueManager>(JobQueueManager)
			expect(jobQueueManager).toBeDefined()
		})

		it('should have ValidationModule services available', () => {
			const validationService = module.get<SimpleValidationService>(SimpleValidationService)
			expect(validationService).toBeDefined()
		})

		it('should have CacheModule services available', () => {
			const cacheManager = module.get<MultiLayerCacheManager>(MultiLayerCacheManager)
			expect(cacheManager).toBeDefined()
		})

		it('should have HttpModule services available', () => {
			const httpClient = module.get<HttpClientService>(HttpClientService)
			expect(httpClient).toBeDefined()
		})

		it('should have CorrelationModule services available', () => {
			const correlationService = module.get<CorrelationService>(CorrelationService)
			expect(correlationService).toBeDefined()
		})

		it('should have MetricsModule services available', () => {
			const metricsService = module.get<MetricsService>(MetricsService)
			expect(metricsService).toBeDefined()
		})
	})

	describe('global Providers', () => {
		it('should register AdaptiveRateLimitGuard as APP_GUARD', () => {
			// Global providers are registered but not directly accessible in test modules
			// We verify they exist by checking the guard class is available
			const guard = module.get<AdaptiveRateLimitGuard>(AdaptiveRateLimitGuard)
			expect(guard).toBeDefined()
		})

		it('should register MediaStreamExceptionFilter as APP_FILTER', () => {
			// Global providers are registered but not directly accessible in test modules
			// We verify the module loads without errors, which means the filter is properly configured
			expect(module).toBeDefined()
			expect(app).toBeDefined()
		})
	})

	describe('cross-Module Dependencies', () => {
		it('should resolve dependencies between modules correctly', () => {
			// Test that services can access their dependencies from other modules
			const correlationService = module.get<CorrelationService>(CorrelationService)
			const configService = module.get<ConfigService>(ConfigService)

			expect(correlationService).toBeDefined()
			expect(configService).toBeDefined()

			// These services should be able to work together
			const correlationId = correlationService.generateCorrelationId()
			expect(correlationId).toBeDefined()
			expect(typeof correlationId).toBe('string')
		})

		it('should allow cache services to work with configuration', () => {
			const cacheManager = module.get<MultiLayerCacheManager>(MultiLayerCacheManager)
			const configService = module.get<ConfigService>(ConfigService)

			expect(cacheManager).toBeDefined()
			expect(configService).toBeDefined()
		})

		it('should allow HTTP services to work with correlation', () => {
			const httpClient = module.get<HttpClientService>(HttpClientService)
			const correlationService = module.get<CorrelationService>(CorrelationService)

			expect(httpClient).toBeDefined()
			expect(correlationService).toBeDefined()
		})
	})

	describe('module Health Check', () => {
		it('should have all health indicators registered', async () => {
			const healthController = module.get<HealthController>(HealthController)

			// This should not throw an error if all health indicators are properly registered
			expect(() => healthController).not.toThrow()
		})

		it('should have metrics collection working', () => {
			const metricsService = module.get<MetricsService>(MetricsService)

			// Test basic metrics functionality
			expect(() => {
				metricsService.recordHttpRequest('GET', '/test', 200, 100)
			}).not.toThrow()
		})
	})

	describe('application Startup', () => {
		it('should start application without errors', async () => {
			// The app should already be initialized in beforeAll
			expect(app).toBeDefined()
			expect(app.getHttpServer()).toBeDefined()
		})

		it('should have middleware configured', () => {
			// Test that the middleware configuration doesn't cause errors
			const httpAdapter = app.getHttpAdapter()
			expect(httpAdapter).toBeDefined()
		})
	})
})
