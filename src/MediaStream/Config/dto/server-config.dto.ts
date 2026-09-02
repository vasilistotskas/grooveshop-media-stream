import { Type } from 'class-transformer'
import { IsDefined, IsNumber, IsString, Max, Min, ValidateNested } from 'class-validator'

export class CorsConfigDto {
	@IsString()
	origin!: string

	@IsString()
	methods!: string

	@IsNumber()
	@Min(0)
	@Max(86400)
	maxAge!: number
}

export class ServerConfigDto {
	@IsNumber()
	@Min(1)
	@Max(65535)
	port!: number

	@IsString()
	host!: string

	@IsDefined()
	@ValidateNested()
	@Type(() => CorsConfigDto)
	cors!: CorsConfigDto
}
