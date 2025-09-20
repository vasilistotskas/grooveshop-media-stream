import { Transform } from 'class-transformer'
import { IsArray, IsNumber, IsString, Max, Min } from 'class-validator'

export class ProcessingConfigDto {
	@IsNumber()
	@Min(1)
	@Max(100)
	@Transform(({ value }) => {
		const parsed = Number.parseInt(value)
		return Number.isNaN(parsed) ? 10 : parsed
	})
	maxConcurrent: number = 10

	@IsNumber()
	@Min(1000)
	@Max(300000)
	@Transform(({ value }) => Number.parseInt(value) || 30000)
	timeout: number = 30000

	@IsNumber()
	@Min(0)
	@Max(10)
	@Transform(({ value }) => Number.parseInt(value) || 3)
	retries: number = 3

	@IsNumber()
	@Min(1024)
	@Max(52428800)
	@Transform(({ value }) => Number.parseInt(value) || 10485760)
	maxFileSize: number = 10485760

	@IsArray()
	@IsString({ each: true })
	@Transform(({ value }) => {
		if (typeof value === 'string') {
			return value.split(',').map(format => format.trim().toLowerCase())
		}
		return value || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']
	})
	allowedFormats: string[] = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg']
}
