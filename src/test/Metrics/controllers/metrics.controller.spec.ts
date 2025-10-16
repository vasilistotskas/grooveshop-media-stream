import type { MockedObject } from 'vitest'
import { MetricsController } from '#microservice/Metrics/controllers/metrics.controller'
import { MetricsService } from '#microservice/Metrics/services/metrics.service'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import 'reflect-metadata'

describe('metricsController', () => {
	let controller: MetricsController
	let metricsService: MockedObject<MetricsService>

	beforeEach(async () => {
		const mockMetricsService = {
			getMetrics: vi.fn(),
			getRegistry: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			controllers: [MetricsController],
			providers: [
				{
					provide: MetricsService,
					useValue: mockMetricsService,
				},
			],
		}).compile()

		controller = module.get<MetricsController>(MetricsController)
		metricsService = module.get(MetricsService)
	})

	describe('getMetrics', () => {
		it('should return metrics in Prometheus format', async () => {
			const mockMetrics = `# HELP mediastream_http_requests_total Total number of HTTP requests
# TYPE mediastream_http_requests_total counter
mediastream_http_requests_total{method="GET",route="/test",status_code="200"} 1`

			metricsService.getMetrics.mockResolvedValue(mockMetrics)

			const result = await controller.getMetrics()

			expect(result).toBe(mockMetrics)
			expect(metricsService.getMetrics).toHaveBeenCalledTimes(1)
		})

		it('should handle empty metrics', async () => {
			metricsService.getMetrics.mockResolvedValue('')

			const result = await controller.getMetrics()

			expect(result).toBe('')
			expect(metricsService.getMetrics).toHaveBeenCalledTimes(1)
		})

		it('should handle metrics service errors', async () => {
			metricsService.getMetrics.mockRejectedValue(new Error('Metrics error'))

			await expect(controller.getMetrics()).rejects.toThrow('Metrics error')
		})
	})

	describe('getMetricsHealth', () => {
		it('should return health status', () => {
			const mockRegistry = {
				getMetricsAsArray: vi.fn().mockReturnValue([
					{ name: 'metric1' },
					{ name: 'metric2' },
				]),
			}

			metricsService.getRegistry.mockReturnValue(mockRegistry as any)

			const result = controller.getMetricsHealth()

			expect(result).toEqual({
				status: 'healthy',
				timestamp: expect.any(Number),
				service: 'metrics',
				registry: {
					metricsCount: 2,
				},
			})
		})

		it('should handle registry errors gracefully', () => {
			const mockRegistry = {
				getMetricsAsArray: vi.fn().mockImplementation(() => {
					throw new Error('Registry error')
				}),
			}

			metricsService.getRegistry.mockReturnValue(mockRegistry as any)

			expect(() => controller.getMetricsHealth()).toThrow('Registry error')
		})
	})
})
