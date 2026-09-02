import { IsBoolean, IsNumber, Min } from 'class-validator'

export class MonitoringConfigDto {
	@IsBoolean()
	enabled!: boolean

	// Only a lower bound: collecting too often wastes CPU, a longer interval is
	// always safe. An upper cap once rejected legitimate production values.
	@IsNumber()
	@Min(10000)
	systemMetricsInterval!: number

	@IsNumber()
	@Min(5000)
	performanceMetricsInterval!: number
}
