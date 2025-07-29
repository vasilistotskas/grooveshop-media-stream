import { Module } from '@nestjs/common'
import { ConfigModule } from '../Config/config.module'
import { CorrelationModule } from '../Correlation/correlation.module'
import { InputSanitizationService } from './services/input-sanitization.service'
import { SecurityCheckerService } from './services/security-checker.service'
import { SimpleValidationService } from './services/simple-validation.service'

@Module({
	imports: [
		ConfigModule,
		CorrelationModule,
	],
	providers: [
		InputSanitizationService,
		SecurityCheckerService,
		SimpleValidationService,
	],
	exports: [
		InputSanitizationService,
		SecurityCheckerService,
		SimpleValidationService,
	],
})
export class ValidationModule {}
