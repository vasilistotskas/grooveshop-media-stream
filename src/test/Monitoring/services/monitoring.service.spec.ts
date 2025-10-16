import type { MockedObject } from 'vitest'
import { CorrelationService } from '#microservice/Correlation/services/correlation.service'
import { MetricType } from '#microservice/Monitoring/interfaces/monitoring.interface'
import { MonitoringService } from '#microservice/Monitoring/services/monitoring.service'
import { ConfigService } from '@nestjs/config'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('monitoringService', () => {
	let service: MonitoringService
	let configService: MockedObject<ConfigService>
	let correlationService: MockedObject<CorrelationService>

	beforeEach(async () => {
		const mockConfigService = {
			get: vi.fn().mockReturnValue({
				enabled: true,
				metricsRetentionMs: 24 * 60 * 60 * 1000,
				alertsRetentionMs: 7 * 24 * 60 * 60 * 1000,
				performanceRetentionMs: 24 * 60 * 60 * 1000,
				healthCheckIntervalMs: 30 * 1000,
				alertCooldownMs: 5 * 60 * 1000,
				externalIntegrations: {
					enabled: false,
					endpoints: [],
				},
			}),
		}

		const mockCorrelationService = {
			getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				MonitoringService,
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: CorrelationService, useValue: mockCorrelationService },
			],
		}).compile()

		service = module.get<MonitoringService>(MonitoringService)
		configService = module.get(ConfigService)
		correlationService = module.get(CorrelationService)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('recordMetric', () => {
		it('should record a metric successfully', () => {
			service.recordMetric('test.metric', 100, MetricType.GAUGE, { tag: 'value' })

			const metrics = service.getMetrics('test.metric')
			expect(metrics).toHaveLength(1)
			expect(metrics[0]).toMatchObject({
				name: 'test.metric',
				value: 100,
				type: MetricType.GAUGE,
				tags: { tag: 'value' },
			})
		})

		it('should not record metrics when disabled', () => {
			configService.get.mockReturnValue({ enabled: false })
			const disabledService = new MonitoringService(configService, correlationService)

			disabledService.recordMetric('test.metric', 100, MetricType.GAUGE)

			const metrics = disabledService.getMetrics('test.metric')
			expect(metrics).toHaveLength(0)
		})
	})

	describe('incrementCounter', () => {
		it('should increment counter with default value', () => {
			service.incrementCounter('test.counter')

			const metrics = service.getMetrics('test.counter')
			expect(metrics).toHaveLength(1)
			expect(metrics[0].value).toBe(1)
			expect(metrics[0].type).toBe(MetricType.COUNTER)
		})

		it('should increment counter with custom value', () => {
			service.incrementCounter('test.counter', 5)

			const metrics = service.getMetrics('test.counter')
			expect(metrics[0].value).toBe(5)
		})
	})

	describe('recordGauge', () => {
		it('should record gauge metric', () => {
			service.recordGauge('test.gauge', 75.5)

			const metrics = service.getMetrics('test.gauge')
			expect(metrics).toHaveLength(1)
			expect(metrics[0].value).toBe(75.5)
			expect(metrics[0].type).toBe(MetricType.GAUGE)
		})
	})

	describe('recordHistogram', () => {
		it('should record histogram metric', () => {
			service.recordHistogram('test.histogram', 250)

			const metrics = service.getMetrics('test.histogram')
			expect(metrics).toHaveLength(1)
			expect(metrics[0].value).toBe(250)
			expect(metrics[0].type).toBe(MetricType.HISTOGRAM)
		})
	})

	describe('recordTimer', () => {
		it('should record timer metric', () => {
			service.recordTimer('test.timer', 1500)

			const metrics = service.getMetrics('test.timer')
			expect(metrics).toHaveLength(1)
			expect(metrics[0].value).toBe(1500)
			expect(metrics[0].type).toBe(MetricType.TIMER)
		})
	})

	describe('getAggregatedMetrics', () => {
		beforeEach(() => {
			// Add some test metrics
			service.recordMetric('test.aggregated', 10, MetricType.GAUGE)
			service.recordMetric('test.aggregated', 20, MetricType.GAUGE)
			service.recordMetric('test.aggregated', 30, MetricType.GAUGE)
		})

		it('should return aggregated statistics', () => {
			const aggregated = service.getAggregatedMetrics('test.aggregated', 0)

			expect(aggregated.count).toBe(3)
			expect(aggregated.sum).toBe(60)
			expect(aggregated.avg).toBe(20)
			expect(aggregated.min).toBe(10)
			expect(aggregated.max).toBe(30)
			expect(aggregated.latest).toBe(30)
		})

		it('should return empty stats for non-existent metric', () => {
			const aggregated = service.getAggregatedMetrics('non.existent', 0)

			expect(aggregated.count).toBe(0)
			expect(aggregated.sum).toBe(0)
			expect(aggregated.avg).toBe(0)
		})
	})

	describe('getSystemHealth', () => {
		it('should return system health status', async () => {
			const health = await service.getSystemHealth()

			expect(health).toHaveProperty('status')
			expect(health).toHaveProperty('timestamp')
			expect(health).toHaveProperty('components')
			expect(health).toHaveProperty('overallScore')
			expect(health.components).toHaveLength(4) // memory, disk, network, cache
		})

		it('should include all required components', async () => {
			const health = await service.getSystemHealth()
			const componentNames = health.components.map(c => c.name)

			expect(componentNames).toContain('memory')
			expect(componentNames).toContain('disk')
			expect(componentNames).toContain('network')
			expect(componentNames).toContain('cache')
		})
	})

	describe('getStats', () => {
		beforeEach(() => {
			service.recordMetric('test.counter', 1, MetricType.COUNTER)
			service.recordMetric('test.gauge', 50, MetricType.GAUGE)
			service.recordMetric('test.timer', 100, MetricType.TIMER)
		})

		it('should return monitoring statistics', () => {
			const stats = service.getStats()

			expect(stats).toHaveProperty('totalMetrics')
			expect(stats).toHaveProperty('metricTypes')
			expect(stats).toHaveProperty('oldestMetric')
			expect(stats).toHaveProperty('newestMetric')
			expect(stats).toHaveProperty('memoryUsage')

			expect(stats.totalMetrics).toBe(3)
			expect(stats.metricTypes).toHaveProperty('counter', 1)
			expect(stats.metricTypes).toHaveProperty('gauge', 1)
			expect(stats.metricTypes).toHaveProperty('timer', 1)
		})
	})

	describe('getMetricNames', () => {
		beforeEach(() => {
			service.recordMetric('metric.one', 1, MetricType.COUNTER)
			service.recordMetric('metric.two', 2, MetricType.GAUGE)
		})

		it('should return all metric names', () => {
			const names = service.getMetricNames()

			expect(names).toContain('metric.one')
			expect(names).toContain('metric.two')
			expect(names).toHaveLength(2)
		})
	})
})
