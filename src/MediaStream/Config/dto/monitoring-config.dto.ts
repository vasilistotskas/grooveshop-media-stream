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
}
