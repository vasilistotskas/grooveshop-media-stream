import type { ConfigService } from '#microservice/Config/config.service'
import { resolve } from 'node:path'

/**
 * Absolute path of the on-disk cache tier (`CACHE_FILE_DIRECTORY`). Every
 * class that reads or writes `storage/` resolves the directory through here.
 */
export function storageDirectory(configService: ConfigService): string {
	return resolve(configService.get<string>('cache.file.directory'))
}
