import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import * as fs from 'fs/promises'
import * as path from 'path'

@Injectable()
export class CleanupService {
	private readonly logger = new Logger(CleanupService.name)

	@Cron(CronExpression.EVERY_DAY_AT_4PM, {
		name: 'cleanup'
	})
	async handleCleanup() {
		const projectRoot = process.cwd()
		const directoryPath = path.join(projectRoot, 'storage')
		let deletedFilesCount = 0

		try {
			const files = await fs.readdir(directoryPath)
			for (const file of files) {
				if (file.endsWith('.rst') || file.endsWith('.rsc') || file.endsWith('.rsm')) {
					await fs.unlink(path.join(directoryPath, file))
					deletedFilesCount++
				}
			}
			this.logger.log(`${deletedFilesCount} files deleted.`)
		} catch (err) {
			this.logger.error(`Error during cleanup: ${err}`)
		}
	}
}
