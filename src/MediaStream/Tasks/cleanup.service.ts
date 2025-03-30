import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

@Injectable()
export class CleanupService {
	constructor(private readonly logger: Logger) {}

	@Cron(CronExpression.EVERY_WEEK, {
		name: 'cleanup',
	})
	async handleCleanup(): Promise<void> {
		const projectRoot = cwd()
		const directoryPath = path.join(projectRoot, 'storage')
		let deletedFilesCount = 0

		try {
			const files = await fs.readdir(directoryPath)
			for (const file of files) {
				if (file.endsWith('.rst') || file.endsWith('.rsc') || file.endsWith('.rsm') || file.endsWith('.webp')) {
					await fs.unlink(path.join(directoryPath, file))
					deletedFilesCount++
				}
			}
			this.logger.debug(`${deletedFilesCount} files deleted.`)
		}
		catch (err) {
			this.logger.error(`Error during cleanup: ${err}`)
		}
	}
}
