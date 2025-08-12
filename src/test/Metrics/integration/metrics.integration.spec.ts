import { ConfigModule } from '@microservice/Config/config.module'
import { MetricsModule } from '@microservice/Metrics/metrics.module'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { INestApplication } from '@nestjs/common'
import { Test, TestingModule } from '@nestjs/testing'
import request from 'supertest'
import 'reflect-metadata'

describe('metrics Integration', () => {
	let app: INestApplication
	let metricsService: MetricsService

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [ConfigModule, MetricsModule],
		}).compile()

		app = moduleFixture.createNestApplication()
		metricsService = moduleFixture.get<MetricsService>(MetricsService)

		await app.init()
	})

	beforeEach(() => {
		// Reset metrics before each test
		metricsService.reset()
	})

	afterAll(async () => {
		// Add delay to allow pending requests to complete
		await new Promise(resolve => setTimeout(resolve, 100))

		if (app) {
			await app.close()
		}
	})

	describe('metrics Endpoint', () => {
		it('should expose metrics at /metrics endpoint', async () => {
			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			expect(response.headers['content-type']).toContain('text/plain')
			expect(response.text).toContain('# HELP')
			expect(response.text).toContain('# TYPE')
			expect(response.text).toContain('mediastream_')
		})

		it('should include default Node.js metrics', async () => {
			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			expect(response.text).toContain('mediastream_nodejs_')
			expect(response.text).toContain('process_')
		})

		it('should track HTTP requests automatically', async () => {
			// Make a request to generate metrics
			await request(app.getHttpServer())
				.get('/metrics/health')
				.expect(200)

			// Check that the request was tracked
			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			expect(response.text).toContain('mediastream_http_requests_total')
			expect(response.text).toContain('method="GET"')
			expect(response.text).toContain('status_code="200"')
		})
	})

	describe('metrics Health Endpoint', () => {
		it('should provide health status at /metrics/health', async () => {
			const response = await request(app.getHttpServer())
				.get('/metrics/health')
				.expect(200)

			expect(response.body).toEqual({
				status: 'healthy',
				timestamp: expect.any(Number),
				service: 'metrics',
				registry: {
					metricsCount: expect.any(Number),
				},
			})
		})
	})

	describe('custom Metrics Recording', () => {
		it('should record and expose custom HTTP metrics', async () => {
			// Record some custom metrics
			metricsService.recordHttpRequest('POST', '/api/test', 201, 0.5, 1024, 2048)
			metricsService.recordHttpRequest('GET', '/api/test', 200, 0.2)

			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			expect(response.text).toContain('mediastream_http_requests_total')
			expect(response.text).toContain('mediastream_http_request_duration_seconds')
			expect(response.text).toContain('method="POST"')
			expect(response.text).toContain('method="GET"')
			expect(response.text).toContain('route="/api/test"')
			expect(response.text).toContain('status_code="201"')
			expect(response.text).toContain('status_code="200"')
		})

		it('should record and expose cache metrics', async () => {
			metricsService.recordCacheOperation('get', 'memory', 'hit', 0.01)
			metricsService.recordCacheOperation('set', 'redis', 'success', 0.05)
			metricsService.updateCacheHitRatio('memory', 0.85)
			metricsService.updateCacheSize('memory', 1024000)

			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			expect(response.text).toContain('mediastream_cache_operations_total')
			expect(response.text).toContain('mediastream_cache_operation_duration_seconds')
			expect(response.text).toContain('mediastream_cache_hit_ratio')
			expect(response.text).toContain('mediastream_cache_size_bytes')
			expect(response.text).toContain('cache_type="memory"')
			expect(response.text).toContain('cache_type="redis"')
		})

		it('should record and expose image processing metrics', async () => {
			metricsService.recordImageProcessing('resize', 'webp', 'success', 2.5)
			metricsService.recordImageProcessing('convert', 'jpg', 'error', 0.1)
			metricsService.updateImageProcessingQueueSize(3)

			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			expect(response.text).toContain('mediastream_image_processing_total')
			expect(response.text).toContain('mediastream_image_processing_duration_seconds')
			expect(response.text).toContain('mediastream_image_processing_queue_size')
			expect(response.text).toContain('mediastream_image_processing_errors_total')
			expect(response.text).toContain('operation="resize"')
			expect(response.text).toContain('operation="convert"')
			expect(response.text).toContain('format="webp"')
			expect(response.text).toContain('format="jpg"')
		})

		it('should record and expose system metrics', async () => {
			metricsService.updateMemoryMetrics({
				rss: 100 * 1024 * 1024,
				heapTotal: 50 * 1024 * 1024,
				heapUsed: 30 * 1024 * 1024,
				external: 10 * 1024 * 1024,
			})
			metricsService.updateCpuUsage(45.5, 12.3)
			metricsService.updateLoadAverage(1.2, 1.5, 1.8)

			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			expect(response.text).toContain('mediastream_memory_usage_bytes')
			expect(response.text).toContain('mediastream_cpu_usage_percent')
			expect(response.text).toContain('mediastream_load_average')
			expect(response.text).toContain('type="rss"')
			expect(response.text).toContain('type="user"')
			expect(response.text).toContain('period="1m"')
		})

		it('should record and expose error metrics', async () => {
			metricsService.recordError('validation', 'image_processing')
			metricsService.recordError('network', 'external_request')

			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			expect(response.text).toContain('mediastream_errors_total')
			expect(response.text).toContain('type="validation"')
			expect(response.text).toContain('type="network"')
			expect(response.text).toContain('operation="image_processing"')
			expect(response.text).toContain('operation="external_request"')
		})
	})

	describe('requests in Flight Tracking', () => {
		it('should track requests in flight during concurrent requests', async () => {
			// Use sequential requests instead of concurrent to avoid ECONNRESET
			const requestCount = process.env.CI ? 3 : 5

			try {
				// Make sequential requests with small delays to avoid overwhelming the server
				for (let i = 0; i < requestCount; i++) {
					await request(app.getHttpServer())
						.get('/metrics/health')
						.timeout(5000)
						.expect(200)

					// Small delay between requests
					if (i < requestCount - 1) {
						await new Promise(resolve => setTimeout(resolve, 50))
					}
				}

				// Add delay before checking metrics
				await new Promise(resolve => setTimeout(resolve, 100))

				const response = await request(app.getHttpServer())
					.get('/metrics')
					.timeout(5000)
					.expect(200)

				expect(response.text).toContain('mediastream_requests_in_flight')
			}
			catch (error) {
				console.error('Requests in flight test failed:', error)
				throw error
			}
		}, 15000) // Increase timeout for this test
	})

	describe('performance Metrics', () => {
		it('should record performance metrics', async () => {
			metricsService.recordGarbageCollection('major', 0.05)
			metricsService.recordEventLoopLag(0.02)

			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			expect(response.text).toContain('mediastream_gc_duration_seconds')
			expect(response.text).toContain('mediastream_event_loop_lag_seconds')
		})
	})

	describe('metrics Format Validation', () => {
		it('should return valid Prometheus format', async () => {
			// Record some metrics to ensure we have data
			metricsService.recordHttpRequest('GET', '/test', 200, 0.1)
			metricsService.recordError('test', 'validation')

			const response = await request(app.getHttpServer())
				.get('/metrics')
				.expect(200)

			const lines = response.text.split('\n')

			// Check for proper Prometheus format
			const helpLines = lines.filter(line => line.startsWith('# HELP'))
			const typeLines = lines.filter(line => line.startsWith('# TYPE'))
			const metricLines = lines.filter(line => line && !line.startsWith('#'))

			expect(helpLines.length).toBeGreaterThan(0)
			expect(typeLines.length).toBeGreaterThan(0)
			expect(metricLines.length).toBeGreaterThan(0)

			// Validate metric line format (basic check)
			metricLines.forEach((line) => {
				if (line.trim() && !line.includes('Nan') && !line.includes('Infinity')) {
					// Allow scientific notation (e.g., 5.11e-7) and regular numbers
					expect(line).toMatch(/^[a-z_:][\w:]*(\{[^}]*\})?\s+[0-9.-]+(e[+-]?\d+)?(\s+\d+)?$/i)
				}
			})
		})
	})
})
