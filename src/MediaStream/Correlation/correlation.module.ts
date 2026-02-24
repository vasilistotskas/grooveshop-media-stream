import { Module } from '@nestjs/common'
import { CorrelationService } from './services/correlation.service.js'

@Module({
	providers: [CorrelationService],
	exports: [CorrelationService],
})
export class CorrelationModule {}
