import { IsBoolean, IsNumber, Max, Min } from 'class-validator'

export class MonitoringConfigDto {
	@IsBoolean()
	enabled: boolean = true

	// Metrics collection intervals (in milliseconds)
	@IsNumber()
	@Min(10000) // Minimum 10 seconds
	@Max(300000) // Maximum 5 minutes
	systemMetricsInterval: number = 60000

	@IsNumber()
	@Min(5000) // Minimum 5 seconds
	@Max(120000) // Maximum 2 minutes
	performanceMetricsInterval: number = 30000
}
