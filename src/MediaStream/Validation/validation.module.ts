import { Module } from '@nestjs/common'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { ConfigModule } from '../Config/config.module.js'
import { CorrelationModule } from '../Correlation/correlation.module.js'
import { TenantDomainsHealthIndicator } from './indicators/tenant-domains-health.indicator.js'
import { ResourceValidationService } from './services/resource-validation.service.js'
import { SecurityCheckerService } from './services/security-checker.service.js'
import { TenantDomainsService } from './services/tenant-domains.service.js'

@Module({
	imports: [
		ConfigModule,
		CorrelationModule,
		MetricsModule,
	],
	providers: [
		ResourceValidationService,
		SecurityCheckerService,
		TenantDomainsService,
		TenantDomainsHealthIndicator,
	],
	exports: [
		ResourceValidationService,
		SecurityCheckerService,
		TenantDomainsService,
		TenantDomainsHealthIndicator,
	],
})
export class ValidationModule {}
