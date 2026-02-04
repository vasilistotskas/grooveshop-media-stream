import type { OnModuleInit } from '@nestjs/common'
import { ConfigService } from '#microservice/Config/config.service'
import { Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'

/**
 * Centralized Sharp configuration service.
 * Ensures consistent Sharp settings across all image processing operations.
 *
 * PERFORMANCE OPTIMIZATION:
 * - Concurrency matched to available CPU cores (1.5 cores = 3-4 concurrent operations)
 * - Cache size optimized for memory limits (100MB memory, 20 files, 150 items)
 * - SIMD enabled for faster processing
 *
 * This replaces conflicting configurations in:
 * - webp-image-manipulation.job.ts (was: 8 concurrent, 200MB cache)
 * - image-processing.processor.ts (was: 4 concurrent, 50MB cache)
 */
@Injectable()
export class SharpConfigService implements OnModuleInit {
	private readonly logger = new Logger(SharpConfigService.name)

	constructor(private readonly configService: ConfigService) {}

	onModuleInit(): void {
		this.configureSharp()
	}

	/**
	 * Configure Sharp with optimized settings for production
	 */
	private configureSharp(): void {
		// Get CPU limit from config or default to 1.5 cores (Kubernetes limit)
		const cpuCores = this.configService.getOptional<number>('processing.cpuCores', 1.5)

		// Calculate optimal concurrency: 2-3x CPU cores for I/O-bound operations
		// With 1.5 cores: 3-4 concurrent operations
		const concurrency = Math.max(2, Math.min(4, Math.floor(cpuCores * 2)))

		sharp.concurrency(concurrency)
		this.logger.log(`Sharp concurrency set to ${concurrency} (based on ${cpuCores} CPU cores)`)

		// Configure cache with balanced settings
		// Memory: 100MB (fits within 1536Mi container limit)
		// Files: 20 (reasonable for typical workload)
		// Items: 150 (balance between memory and performance)
		sharp.cache({
			memory: 100, // 100MB memory cache
			files: 20, // Max 20 files cached
			items: 150, // Max 150 items
		})
		this.logger.log('Sharp cache configured: 100MB memory, 20 files, 150 items')

		// Enable SIMD for better performance on supported CPUs
		sharp.simd(true)
		this.logger.log('Sharp SIMD enabled for improved performance')

		// Log Sharp version and capabilities
		const sharpInfo = {
			version: sharp.versions.sharp,
			libvips: sharp.versions.vips,
			simd: sharp.simd(),
			concurrency: sharp.concurrency(),
		}
		this.logger.log(`Sharp initialized: ${JSON.stringify(sharpInfo)}`)
	}

	/**
	 * Get current Sharp configuration for monitoring/debugging
	 */
	getConfiguration(): {
		concurrency: number
		simd: boolean
		versions: { sharp: string, vips: string }
	} {
		return {
			concurrency: sharp.concurrency(),
			simd: sharp.simd(),
			versions: {
				sharp: sharp.versions.sharp,
				vips: sharp.versions.vips,
			},
		}
	}
}
