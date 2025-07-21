import { ConfigService } from '@microservice/Config/config.service'
import { MetricsService } from '@microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'
import 'reflect-metadata'

describe('metricsService', () => {
	let service: MetricsService
	let configService: jest.Mocked<ConfigService>

	beforeEach(async () => {
		const mockConfigService = {
			get: jest.fn((key: string) => {
				if (key === 'monitoring.enabled')
					return true
				return undefined
			}),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MetricsService,
				{
					provide: ConfigService,
					useValue: mockConfigService,
				},
			],
		}).compile()

		service = module.get<MetricsService>(MetricsService)
		configService = module.get(ConfigService)
	})

	afterEach(() => {
		// Reset metrics after each test
		service.reset()
	})

	describe('initialization', () => {
		it('should be defined', () => {
			expect(service).toBeDefined()
		})

		it('should initialize with monitoring enabled', () => {
			expect(configService.get).toHaveBeenCalledWith('monitoring.enabled')
		})

		it('should provide metrics registry', () => {
			const registry = service.getRegistry()
			expect(registry).toBeDefined()
		})
	})

	describe('hTTP Metrics', () => {
		it('should record HTTP request metrics', async () => {
			service.recordHttpRequest('GET', '/test', 200, 0.5)

			const metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_http_requests_total')
			expect(metrics).toContain('mediastream_http_request_duration_seconds')
			expect(metrics).toContain('method="GET"')
			expect(metrics).toContain('route="/test"')
			expect(metrics).toContain('status_code="200"')
		})

		it('should record multiple HTTP requests', async () => {
			service.recordHttpRequest('GET', '/test', 200, 0.5)
			service.recordHttpRequest('POST', '/api', 201, 1.2)
			service.recordHttpRequest('GET', '/test', 404, 0.3)

			const metrics = await service.getMetrics()
			expect(metrics).toContain('method="GET"')
			expect(metrics).toContain('method="POST"')
			expect(metrics).toContain('status_code="200"')
			expect(metrics).toContain('status_code="201"')
			expect(metrics).toContain('status_code="404"')
		})
	})

	describe('image Processing Metrics', () => {
		it('should record image processing metrics', async () => {
			service.recordImageProcessing('resize', 'webp', 'success', 2.5)

			const metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_image_processing_total')
			expect(metrics).toContain('mediastream_image_processing_duration_seconds')
			expect(metrics).toContain('operation="resize"')
			expect(metrics).toContain('format="webp"')
			expect(metrics).toContain('status="success"')
		})

		it('should record failed image processing', async () => {
			service.recordImageProcessing('convert', 'jpg', 'error', 0.1)

			const metrics = await service.getMetrics()
			expect(metrics).toContain('operation="convert"')
			expect(metrics).toContain('format="jpg"')
			expect(metrics).toContain('status="error"')
		})
	})

	describe('cache Metrics', () => {
		it('should record cache operations', async () => {
			service.recordCacheOperation('get', 'memory', 'hit')
			service.recordCacheOperation('set', 'redis', 'success')
			service.recordCacheOperation('get', 'file', 'miss')

			const metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_cache_operations_total')
			expect(metrics).toContain('operation="get"')
			expect(metrics).toContain('operation="set"')
			expect(metrics).toContain('cache_type="memory"')
			expect(metrics).toContain('cache_type="redis"')
			expect(metrics).toContain('cache_type="file"')
			expect(metrics).toContain('status="hit"')
			expect(metrics).toContain('status="miss"')
			expect(metrics).toContain('status="success"')
		})

		it('should update cache hit ratio', async () => {
			service.updateCacheHitRatio('memory', 0.85)
			service.updateCacheHitRatio('redis', 0.92)

			const metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_cache_hit_ratio')
			expect(metrics).toContain('cache_type="memory"')
			expect(metrics).toContain('cache_type="redis"')
		})
	})

	describe('error Metrics', () => {
		it('should record error metrics', async () => {
			service.recordError('validation', 'image_processing')
			service.recordError('network', 'external_request')

			const metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_errors_total')
			expect(metrics).toContain('type="validation"')
			expect(metrics).toContain('type="network"')
			expect(metrics).toContain('operation="image_processing"')
			expect(metrics).toContain('operation="external_request"')
		})
	})

	describe('system Metrics', () => {
		it('should update memory metrics', async () => {
			const memoryInfo = {
				rss: 100 * 1024 * 1024, // 100MB
				heapTotal: 50 * 1024 * 1024, // 50MB
				heapUsed: 30 * 1024 * 1024, // 30MB
				external: 10 * 1024 * 1024, // 10MB
			}

			service.updateMemoryMetrics(memoryInfo)

			const metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_memory_usage_bytes')
			expect(metrics).toContain('type="rss"')
			expect(metrics).toContain('type="heap_total"')
			expect(metrics).toContain('type="heap_used"')
			expect(metrics).toContain('type="external"')
		})

		it('should update disk space metrics', async () => {
			service.updateDiskSpaceMetrics('/storage', 1000000000, 600000000, 400000000)

			const metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_disk_space_usage_bytes')
			expect(metrics).toContain('type="total"')
			expect(metrics).toContain('type="used"')
			expect(metrics).toContain('type="free"')
			expect(metrics).toContain('path="/storage"')
		})

		it('should update active connections', async () => {
			service.updateActiveConnections('http', 25)
			service.updateActiveConnections('redis', 5)

			const metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_active_connections')
			expect(metrics).toContain('type="http"')
			expect(metrics).toContain('type="redis"')
		})
	})

	describe('metrics Export', () => {
		it('should export metrics in Prometheus format', async () => {
			service.recordHttpRequest('GET', '/test', 200, 0.5)

			const metrics = await service.getMetrics()
			expect(typeof metrics).toBe('string')
			expect(metrics).toContain('# HELP')
			expect(metrics).toContain('# TYPE')
			expect(metrics).toContain('mediastream_')
		})

		it('should include default Node.js metrics', async () => {
			const metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_nodejs_')
			expect(metrics).toContain('process_')
		})
	})

	describe('reset Functionality', () => {
		it('should reset all metrics', async () => {
			service.recordHttpRequest('GET', '/test', 200, 0.5)
			service.recordError('test', 'operation')

			let metrics = await service.getMetrics()
			expect(metrics).toContain('mediastream_http_requests_total')
			expect(metrics).toContain('mediastream_errors_total')

			service.reset()

			metrics = await service.getMetrics()
			// After reset, counters should be back to 0 or not present
			expect(metrics).not.toContain('mediastream_http_requests_total{')
			expect(metrics).not.toContain('mediastream_errors_total{')
		})
	})

	describe('configuration Integration', () => {
		it('should respect monitoring enabled configuration', async () => {
			expect(configService.get).toHaveBeenCalledWith('monitoring.enabled')
		})

		it('should handle disabled monitoring', async () => {
			configService.get.mockImplementation((key: string) => {
				if (key === 'monitoring.enabled')
					return false
				return undefined
			})

			// Create new service instance with monitoring disabled
			const module: TestingModule = await Test.createTestingModule({
				providers: [
					MetricsService,
					{
						provide: ConfigService,
						useValue: configService,
					},
				],
			}).compile()

			const disabledService = module.get<MetricsService>(MetricsService)

			// Service should still work but may not collect periodic metrics
			expect(disabledService).toBeDefined()
			const metrics = await disabledService.getMetrics()
			expect(typeof metrics).toBe('string')
		})
	})
})
