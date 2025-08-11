import { BullModule } from '@nestjs/bull'
import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { TerminusModule } from '@nestjs/terminus'
import { CacheModule } from '../Cache/cache.module'
import { CorrelationModule } from '../Correlation/correlation.module'
import { HttpModule } from '../HTTP/http.module'
import { JobQueueHealthIndicator } from './indicators/job-queue-health.indicator'
import { CacheOperationsProcessor } from './processors/cache-operations.processor'
import { ImageProcessingProcessor } from './processors/image-processing.processor'
import { BullQueueService } from './services/bull-queue.service'
import { JobQueueManager } from './services/job-queue.manager'

@Module({
	imports: [
		BullModule.forRootAsync({
			imports: [ConfigModule],
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
		CorrelationModule,
		HttpModule,
		CacheModule,
		TerminusModule,
	],
	providers: [
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
