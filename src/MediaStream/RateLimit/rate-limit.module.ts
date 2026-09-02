import { Module } from '@nestjs/common'
import { CacheModule } from '#microservice/Cache/cache.module'
import { ConfigModule } from '#microservice/Config/config.module'
import { MetricsModule } from '#microservice/Metrics/metrics.module'
import { ValidationModule } from '#microservice/Validation/validation.module'
import { AdaptiveRateLimitGuard } from './guards/adaptive-rate-limit.guard.js'
import { RateLimitService } from './services/rate-limit.service.js'

@Module({
	imports: [
		ConfigModule,
		MetricsModule,
		CacheModule,
		// TenantDomainsService (dynamic per-tenant domain allowlist) is unioned
		// into the rate-limit bypass whitelist check — see AdaptiveRateLimitGuard.
		ValidationModule,
	],
	providers: [RateLimitService, AdaptiveRateLimitGuard],
	// ValidationModule is re-exported so TenantDomainsService stays resolvable
	// for a consumer that applies the guard with @UseGuards outside this module.
	exports: [RateLimitService, AdaptiveRateLimitGuard, ValidationModule],
})
export class RateLimitModule {}
