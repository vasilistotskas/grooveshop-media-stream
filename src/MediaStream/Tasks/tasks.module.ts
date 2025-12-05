import { Logger, Module } from '@nestjs/common'
import { StorageModule } from '../Storage/storage.module.js'

/**
 * TasksModule - Background task scheduling
 *
 * Note: The destructive CleanupService was removed in favor of StorageCleanupService
 * which provides proper retention policies and intelligent eviction.
 * StorageCleanupService is provided by StorageModule and runs daily at 2 AM.
 */
@Module({
	imports: [StorageModule],
	providers: [Logger],
})
export class TasksModule {}
