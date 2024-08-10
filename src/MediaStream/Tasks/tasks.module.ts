import { Module } from '@nestjs/common'
import { CleanupService } from '@microservice/Tasks/cleanup.service'

@Module({
	providers: [CleanupService],
})
export class TasksModule {}
