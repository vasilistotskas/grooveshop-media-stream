import { BullModule } from '@nestjs/bull'
import { Module } from '@nestjs/common'
import { ConfigService, ConfigModule as NestConfigModule } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'
import { CacheModule } from '../Cache/cache.module.js'
import { ConfigModule } from '../Config/config.module.js'
import { CorrelationModule } from '../Correlation/correlation.module.js'
import { HttpModule } from '../HTTP/http.module.js'
import { JobQueueHealthIndicator } from './indicators/job-queue-health.indicator.js'
import { CacheOperationsProcessor } from './processors/cache-operations.processor.js'
import { ImageProcessingProcessor } from './processors/image-processing.processor.js'
import { BullQueueService } from './services/bull-queue.service.js'
import { JobQueueManager } from './services/job-queue.manager.js'
import { SharpConfigService } from './services/sharp-config.service.js'

@Module({
	imports: [
		BullModule.forRootAsync({
			imports: [NestConfigModule],
			useFactory: async (_configService: ConfigService) => ({
				redis: {
					host: _configService.get('REDIS_HOST', 'localhost'),
					port: _configService.get('REDIS_PORT', 6379),
					password: _configService.get('REDIS_PASSWORD'),
					db: _configService.get('REDIS_DB', 0),
					retryDelayOnFailover: 100,
					enableReadyCheck: false,
					maxRetriesPerRequest: 3,
				},
				defaultJobOptions: {
					removeOnComplete: 10,
					removeOnFail: 5,
					attempts: 3,
					backoff: {
						type: 'exponential',
						delay: 2000,
					},
				},
			}),
			inject: [ConfigService],
		}),
		BullModule.registerQueue(
			{
				name: 'image-processing',
				defaultJobOptions: {
					removeOnComplete: 10,
					removeOnFail: 5,
					attempts: 3,
				},
			},
			{
				name: 'cache-operations',
				defaultJobOptions: {
					removeOnComplete: 5,
					removeOnFail: 3,
					attempts: 2,
				},
			},
		),
		ConfigModule,
		CorrelationModule,
		HttpModule,
		CacheModule,
		TerminusModule,
	],
	providers: [
		SharpConfigService, // ✅ Centralized Sharp configuration
		BullQueueService,
		JobQueueManager,
		ImageProcessingProcessor,
		CacheOperationsProcessor,
		JobQueueHealthIndicator,
	],
	exports: [
		JobQueueManager,
		JobQueueHealthIndicator,
	],
})
export class QueueModule {}
