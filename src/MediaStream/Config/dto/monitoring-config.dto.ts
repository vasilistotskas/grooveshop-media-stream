import { Transform } from 'class-transformer'
import { IsBoolean, IsNumber, IsString, Max, Min } from 'class-validator'

export class MonitoringConfigDto {
	@IsBoolean()
	@Transform(({ value }) => {
		if (typeof value === 'string') {
			return value.toLowerCase() === 'true'
		}
		return value !== undefined ? value : true
	})
	enabled: boolean = true

	@IsNumber()
	@Min(1)
	@Max(65535)
	@Transform(({ value }) => Number.parseInt(value) || 9090)
	metricsPort: number = 9090

	@IsString()
	@Transform(({ value }) => value || '/health')
	healthPath: string = '/health'

	@IsString()
	@Transform(({ value }) => value || '/metrics')
	metricsPath: string = '/metrics'

	// ✅ Metrics collection intervals (in milliseconds)
	@IsNumber()
	@Min(10000) // Minimum 10 seconds
	@Max(300000) // Maximum 5 minutes
	@Transform(({ value }) => Number.parseInt(value) || 60000)
	systemMetricsInterval: number = 60000 // 60 seconds

	@IsNumber()
	@Min(5000) // Minimum 5 seconds
	@Max(120000) // Maximum 2 minutes
	@Transform(({ value }) => Number.parseInt(value) || 30000)
	performanceMetricsInterval: number = 30000 // 30 seconds

	// ✅ Disk space cache TTL (in milliseconds)
	@IsNumber()
	@Min(60000) // Minimum 1 minute
	@Max(600000) // Maximum 10 minutes
	@Transform(({ value }) => Number.parseInt(value) || 300000)
	diskSpaceCacheTtl: number = 300000 // 5 minutes
}
