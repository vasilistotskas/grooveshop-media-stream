import { IsNumber, IsString, Min } from 'class-validator'

export class TenantDomainsConfigDto {
	// May be blank ("derive from backend.url") — not validated as a URL here.
	@IsString()
	refreshUrl!: string

	// Blank disables the feature; not a secret-strength check, just shape.
	@IsString()
	secret!: string

	@IsNumber()
	@Min(5000)
	refreshIntervalMs!: number
}
