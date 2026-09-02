import type { OnModuleInit } from '@nestjs/common'
import { Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'
import { ConfigService } from '#microservice/Config/config.service'

/** libvips threads per CPU core; image work is I/O-bound enough to oversubscribe. */
const CONCURRENCY_PER_CORE = 2
const MIN_CONCURRENCY = 2
const MAX_CONCURRENCY = 4

/** libvips operation cache, sized for the 1536Mi container limit. */
const CACHE_MEMORY_MB = 100
const CACHE_FILES = 20
const CACHE_ITEMS = 150

/**
 * Applies the process-wide Sharp settings (concurrency, libvips cache, SIMD)
 * once at boot, before the first image is processed.
 */
@Injectable()
export class SharpConfigService implements OnModuleInit {
	private readonly logger = new Logger(SharpConfigService.name)

	constructor(private readonly configService: ConfigService) {}

	onModuleInit(): void {
		const cpuCores = this.configService.get<number>('processing.cpuCores')
		const concurrency = Math.max(MIN_CONCURRENCY, Math.min(MAX_CONCURRENCY, Math.floor(cpuCores * CONCURRENCY_PER_CORE)))

		sharp.concurrency(concurrency)
		sharp.cache({ memory: CACHE_MEMORY_MB, files: CACHE_FILES, items: CACHE_ITEMS })
		sharp.simd(true)

		this.logger.log(`Sharp ${sharp.versions.sharp} (libvips ${sharp.versions.vips}) initialized: concurrency ${sharp.concurrency()} for ${cpuCores} CPU cores, cache ${CACHE_MEMORY_MB}MB/${CACHE_FILES} files/${CACHE_ITEMS} items, simd ${sharp.simd()}`)
	}
}
