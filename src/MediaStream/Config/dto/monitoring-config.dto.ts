import { IsBoolean, IsNumber, Min } from 'class-validator'

export class MonitoringConfigDto {
	@IsBoolean()
	enabled: boolean = true

	// Metrics collection intervals (in milliseconds). Only a lower bound is
	// enforced: collecting too frequently wastes CPU, but a larger interval
	// (collect less often) is always safe — there is no meaningful upper cap.
	// A previous @Max(300000)/@Max(120000) here rejected legitimate
	// production intervals (e.g. 30-minute system / 10-minute performance),
	// crashing startup once config validation began running against the
	// schema-built config.
	@IsNumber()
	@Min(10000) // Minimum 10 seconds
	systemMetricsInterval: number = 60000

	@IsNumber()
	@Min(5000) // Minimum 5 seconds
	performanceMetricsInterval: number = 30000
}
