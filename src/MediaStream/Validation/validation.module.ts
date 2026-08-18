import { Module } from '@nestjs/common'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { CacheModule } from '../Cache/cache.module.js'
import { ConfigModule } from '../Config/config.module.js'
import { CorrelationModule } from '../Correlation/correlation.module.js'
import { TenantDomainsHealthIndicator } from './indicators/tenant-domains-health.indicator.js'
import { InputSanitizationService } from './services/input-sanitization.service.js'
import { SecurityCheckerService } from './services/security-checker.service.js'
import { TenantDomainsService } from './services/tenant-domains.service.js'

@Module({
	imports: [
		ConfigModule,
		CorrelationModule,
		CacheModule,
		MetricsModule,
	],
	providers: [
		InputSanitizationService,
		SecurityCheckerService,
		TenantDomainsService,
		TenantDomainsHealthIndicator,
	],
	exports: [
		InputSanitizationService,
		SecurityCheckerService,
		TenantDomainsService,
		TenantDomainsHealthIndicator,
	],
})
export class ValidationModule {}
