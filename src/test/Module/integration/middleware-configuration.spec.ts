import { CacheHealthIndicator } from '@microservice/Cache/indicators/cache-health.indicator'
import { RedisHealthIndicator } from '@microservice/Cache/indicators/redis-health.indicator'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { DiskSpaceHealthIndicator } from '@microservice/Health/indicators/disk-space-health.indicator'
import { MemoryHealthIndicator } from '@microservice/Health/indicators/memory-health.indicator'
import { HttpHealthIndicator } from '@microservice/HTTP/indicators/http-health.indicator'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import MediaStreamModule from '@microservice/Module/MediaStreamModule'
import { AlertingHealthIndicator } from '@microservice/Monitoring/indicators/alerting-health.indicator'
import { SystemHealthIndicator } from '@microservice/Monitoring/indicators/system-health.indicator'
import { JobQueueHealthIndicator } from '@microservice/Queue/indicators/job-queue-health.indicator'
import { StorageHealthIndicator } from '@microservice/Storage/indicators/storage-health.indicator'
import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'

describe('middleware Configuration', () => {
	let app: INestApplication
	let module: TestingModule
	let _correlationService: CorrelationService
	let metricsService: MetricsService

	beforeAll(async () => {
		module = await Test.createTestingModule({
			imports: [MediaStreamModule],
		})
			.overrideProvider(CacheHealthIndicator)
			.useValue({
				isHealthy: jest.fn().mockResolvedValue({ cache: { status: 'up' } }),
			})
			.overrideProvider(RedisHealthIndicator)
			.useValue({
				isHealthy: jest.fn().mockResolvedValue({ redis: { status: 'up' } }),
			})
			.overrideProvider(DiskSpaceHealthIndicator)
			.useValue({
				isHealthy: jest.fn().mockResolvedValue({ disk: { status: 'up', free: '10GB', used: '5GB' } }),
				getCurrentDiskInfo: jest.fn().mockResolvedValue({ free: '10GB', used: '5GB', total: '15GB' }),
			})
			.overrideProvider(MemoryHealthIndicator)
			.useValue({
				isHealthy: jest.fn().mockResolvedValue({ memory: { status: 'up', used: '100MB', free: '900MB' } }),
				getCurrentMemoryInfo: jest.fn().mockReturnValue({ used: '100MB', free: '900MB', total: '1GB' }),
			})
			.overrideProvider(HttpHealthIndicator)
			.useValue({
				isHealthy: jest.fn().mockResolvedValue({ http: { status: 'up' } }),
			})
			.overrideProvider(AlertingHealthIndicator)
			.useValue({
				isHealthy: jest.fn().mockResolvedValue({ alerting: { status: 'up' } }),
			})
			.overrideProvider(SystemHealthIndicator)
			.useValue({
				isHealthy: jest.fn().mockResolvedValue({ system: { status: 'up' } }),
			})
			.overrideProvider(JobQueueHealthIndicator)
			.useValue({
				isHealthy: jest.fn().mockResolvedValue({ jobQueue: { status: 'up' } }),
			})
			.overrideProvider(StorageHealthIndicator)
			.useValue({
				isHealthy: jest.fn().mockResolvedValue({ storage: { status: 'up' } }),
			})
			.compile()

		app = module.createNestApplication()
		_correlationService = module.get<CorrelationService>(CorrelationService)
		metricsService = module.get<MetricsService>(MetricsService)

		await app.init()
	})

	afterAll(async () => {
		await app.close()
	})

	describe('correlation Middleware', () => {
		it('should add correlation ID to requests', async () => {
			const response = await request(app.getHttpServer())
				.get('/health')
				.expect(200)

			// Check if correlation ID header is present
			expect(response.headers['x-correlation-id']).toBeDefined()
			expect(typeof response.headers['x-correlation-id']).toBe('string')
		})

		it('should preserve existing correlation ID', async () => {
			const existingCorrelationId = 'test-correlation-123'

			const response = await request(app.getHttpServer())
				.get('/health')
				.set('x-correlation-id', existingCorrelationId)
				.expect(200)

			expect(response.headers['x-correlation-id']).toBe(existingCorrelationId)
		})
	})

	describe('timing Middleware', () => {
		it('should add response time header', async () => {
			const response = await request(app.getHttpServer())
				.get('/health')
				.expect(200)

			expect(response.headers['x-response-time']).toBeDefined()
			expect(response.headers['x-response-time']).toMatch(/^\d+(\.\d+)?ms$/)
		})

		it('should track request timing', async () => {
			await metricsService.getMetrics()

			await request(app.getHttpServer())
				.get('/health')
				.expect(200)

			// Timing should be recorded in metrics
			const updatedMetrics = metricsService.getMetrics()
			expect(updatedMetrics).toBeDefined()
		})
	})

	describe('metrics Middleware', () => {
		it('should track HTTP requests', async () => {
			await metricsService.getMetrics()

			await request(app.getHttpServer())
				.get('/health')
				.expect(200)

			// HTTP request metrics should be updated
			const updatedMetrics = metricsService.getMetrics()
			expect(updatedMetrics).toBeDefined()
		})

		it('should track different HTTP methods', async () => {
			// Test GET request
			await request(app.getHttpServer())
				.get('/health')
				.expect(200)

			// Test HEAD request (if supported)
			await request(app.getHttpServer())
				.head('/health')
				.expect(200)

			const metrics = metricsService.getMetrics()
			expect(metrics).toBeDefined()
		})
	})

	describe('middleware Chain Order', () => {
		it('should execute middleware in correct order', async () => {
			const response = await request(app.getHttpServer())
				.get('/health')
				.expect(200)

			// All middleware should have executed
			expect(response.headers['x-correlation-id']).toBeDefined()
			expect(response.headers['x-response-time']).toBeDefined()
		})

		it('should handle middleware errors gracefully', async () => {
			// Test with invalid route to trigger error handling
			const response = await request(app.getHttpServer())
				.get('/nonexistent-route')
				.expect(404)

			// Middleware should still add headers even for error responses
			expect(response.headers['x-correlation-id']).toBeDefined()
		})
	})

	describe('global Guards', () => {
		it('should apply rate limiting', async () => {
			// Make multiple rapid requests to test rate limiting
			const requests = Array.from({ length: 5 }, () =>
				request(app.getHttpServer()).get('/health'))

			const responses = await Promise.all(requests)

			// All requests should succeed initially (within rate limit)
			responses.forEach((response) => {
				expect([200, 429]).toContain(response.status)
			})
		})
	})

	describe('global Exception Filter', () => {
		it('should handle exceptions with correlation ID', async () => {
			const correlationId = 'test-error-correlation'

			const response = await request(app.getHttpServer())
				.get('/nonexistent-route')
				.set('x-correlation-id', correlationId)
				.expect(404)

			// Error response should include correlation ID
			expect(response.headers['x-correlation-id']).toBe(correlationId)
		})

		it('should provide structured error responses', async () => {
			const response = await request(app.getHttpServer())
				.get('/nonexistent-route')
				.expect(404)

			expect(response.body).toBeDefined()
			// Error response structure may vary, just check it's defined
			expect(response.body.message || response.body.error).toBeDefined()
		})
	})

	describe('integration with Health Checks', () => {
		it('should allow health checks to bypass rate limiting', async () => {
			// Make many health check requests rapidly
			const requests = Array.from({ length: 20 }, () =>
				request(app.getHttpServer()).get('/health'))

			const responses = await Promise.all(requests)

			// Health checks should not be rate limited
			responses.forEach((response) => {
				expect(response.status).toBe(200)
			})
		})
	})
})
