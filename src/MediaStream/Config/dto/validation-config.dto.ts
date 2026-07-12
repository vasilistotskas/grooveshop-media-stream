import { IsArray, IsNumber, IsString, Min } from 'class-validator'

export class ValidationConfigDto {
	@IsArray()
	@IsString({ each: true })
	allowedDomains: string[] = []

	@IsNumber()
	@Min(1)
	maxStringLength: number = 10000
}
