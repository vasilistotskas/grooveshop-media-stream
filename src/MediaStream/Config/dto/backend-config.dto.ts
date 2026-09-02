import { IsString } from 'class-validator'

export class BackendConfigDto {
	// May be blank outside production; ConfigService.validate enforces it there.
	@IsString()
	url!: string
}
