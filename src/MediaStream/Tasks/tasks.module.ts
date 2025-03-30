import { CleanupService } from '@microservice/Tasks/cleanup.service'
import { Logger, Module } from '@nestjs/common'

@Module({
	providers: [CleanupService, Logger],
})
export class TasksModule {}
