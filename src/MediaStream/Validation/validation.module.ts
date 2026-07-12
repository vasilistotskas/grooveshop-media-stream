import { Module } from '@nestjs/common'
import { CacheModule } from '../Cache/cache.module.js'
import { ConfigModule } from '../Config/config.module.js'
import { CorrelationModule } from '../Correlation/correlation.module.js'
import { InputSanitizationService } from './services/input-sanitization.service.js'
import { SecurityCheckerService } from './services/security-checker.service.js'

@Module({
	imports: [
		ConfigModule,
		CorrelationModule,
		CacheModule,
	],
	providers: [
		InputSanitizationService,
		SecurityCheckerService,
	],
	exports: [
		InputSanitizationService,
		SecurityCheckerService,
	],
})
export class ValidationModule {}
