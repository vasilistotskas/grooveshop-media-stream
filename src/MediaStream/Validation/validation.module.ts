import { Module } from '@nestjs/common'
import { CacheModule } from '../Cache/cache.module.js'
import { ConfigModule } from '../Config/config.module.js'
import { CorrelationModule } from '../Correlation/correlation.module.js'
import { InputSanitizationService } from './services/input-sanitization.service.js'
import { SecurityCheckerService } from './services/security-checker.service.js'
import { TenantDomainsService } from './services/tenant-domains.service.js'

@Module({
	imports: [
		ConfigModule,
		CorrelationModule,
		CacheModule,
	],
	providers: [
		InputSanitizationService,
		SecurityCheckerService,
		TenantDomainsService,
	],
	exports: [
		InputSanitizationService,
		SecurityCheckerService,
		TenantDomainsService,
	],
})
export class ValidationModule {}
