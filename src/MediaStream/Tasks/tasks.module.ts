import { CleanupService } from '@microservice/Tasks/cleanup.service'
import { Module } from '@nestjs/common'

@Module({
	providers: [CleanupService],
})
export class TasksModule {}
