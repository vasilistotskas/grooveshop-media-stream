import { Transform, Type } from 'class-transformer'
import { IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator'

export class CorsConfigDto {
	@IsString()
	@Transform(({ value }) => value || '*')
	origin: string = '*'

	@IsString()
	@Transform(({ value }) => value || 'GET')
	methods: string = 'GET'

	@IsNumber()
	@Min(0)
	@Max(86400)
	@Transform(({ value }) => Number.parseInt(value) || 86400)
	maxAge: number = 86400
}

export class ServerConfigDto {
	@IsNumber()
	@Min(1)
	@Max(65535)
	@Transform(({ value }) => {
		if (value === undefined || value === null)
			return 3003
		const parsed = Number.parseInt(value)
		return Number.isNaN(parsed) ? value : parsed
	})
	port: number = 3003

	@IsString()
	@Transform(({ value }) => value || '0.0.0.0')
	host: string = '0.0.0.0'

	@ValidateNested()
	@Type(() => CorsConfigDto)
	cors: CorsConfigDto = new CorsConfigDto()
}
