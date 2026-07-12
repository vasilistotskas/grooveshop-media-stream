import { Type } from 'class-transformer'
import { IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator'

export class CorsConfigDto {
	@IsString()
	origin: string = '*'

	@IsString()
	methods: string = 'GET'

	@IsNumber()
	@Min(0)
	@Max(86400)
	maxAge: number = 86400
}

export class ServerConfigDto {
	@IsNumber()
	@Min(1)
	@Max(65535)
	port: number = 3003

	@IsString()
	host: string = '0.0.0.0'

	@ValidateNested()
	@Type(() => CorsConfigDto)
	cors: CorsConfigDto = new CorsConfigDto()
}
