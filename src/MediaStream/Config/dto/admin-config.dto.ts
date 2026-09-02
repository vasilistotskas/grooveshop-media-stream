import { IsString } from 'class-validator'

export class AdminConfigDto {
	// Blank keeps the internal endpoints closed (InternalSecretGuard fails closed).
	@IsString()
	secret!: string
}
