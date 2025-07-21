import { Transform, Type } from 'class-transformer'
import { IsNumber, IsString, Max, Min } from 'class-validator'

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
	@Transform(({ value }) => Number.parseInt(value) || 3003)
	port: number = 3003

	@IsString()
	@Transform(({ value }) => value || '0.0.0.0')
	host: string = '0.0.0.0'

	@Type(() => CorsConfigDto)
	cors: CorsConfigDto = new CorsConfigDto()
}
