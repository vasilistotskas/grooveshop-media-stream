import { Transform } from 'class-transformer'
import { IsNumber, IsString, IsUrl, Max, Min } from 'class-validator'

export class ExternalServicesConfigDto {
	@IsString()
	@IsUrl({ require_tld: false })
	@Transform(({ value }) => value || 'http://localhost:8000')
	djangoUrl: string = 'http://localhost:8000'

	@IsString()
	@IsUrl({ require_tld: false })
	@Transform(({ value }) => value || 'http://localhost:3000')
	nuxtUrl: string = 'http://localhost:3000'

	@IsNumber()
	@Min(1000)
	@Max(300000) // 5 minutes max
	@Transform(({ value }) => Number.parseInt(value) || 30000) // 30 seconds
	requestTimeout: number = 30000

	@IsNumber()
	@Min(0)
	@Max(10)
	@Transform(({ value }) => Number.parseInt(value) || 3)
	maxRetries: number = 3
}
