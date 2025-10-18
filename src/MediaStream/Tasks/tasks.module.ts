import { Logger, Module } from '@nestjs/common'
import { CleanupService } from './cleanup.service.js'

@Module({
	providers: [CleanupService, Logger],
})
export class TasksModule {}
