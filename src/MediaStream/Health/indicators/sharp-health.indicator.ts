import type { HealthIndicatorResult } from '@nestjs/terminus'
import type { HealthCheckOptions } from '../interfaces/health-indicator.interface.js'
import { Buffer } from 'node:buffer'
import { Injectable, Logger } from '@nestjs/common'
import sharp from 'sharp'
import { BaseHealthIndicator } from '../base/base-health-indicator.js'

/**
 * Health indicator for Sharp image processing library
 * Verifies that Sharp can process images correctly
 */
@Injectable()
export class SharpHealthIndicator extends BaseHealthIndicator {
	private readonly _logger = new Logger(SharpHealthIndicator.name)

	// Minimal 1x1 transparent PNG for health check (68 bytes)
	private readonly testPngBuffer = Buffer.from([
		0x89,
		0x50,
		0x4E,
		0x47,
		0x0D,
		0x0A,
		0x1A,
		0x0A,
		0x00,
		0x00,
		0x00,
		0x0D,
		0x49,
		0x48,
		0x44,
		0x52,
		0x00,
		0x00,
		0x00,
		0x01,
		0x00,
		0x00,
		0x00,
		0x01,
		0x08,
		0x06,
		0x00,
		0x00,
		0x00,
		0x1F,
		0x15,
		0xC4,
		0x89,
		0x00,
		0x00,
		0x00,
		0x0A,
		0x49,
		0x44,
		0x41,
		0x54,
		0x78,
		0x9C,
		0x63,
		0x00,
		0x01,
		0x00,
		0x00,
		0x05,
		0x00,
		0x01,
		0x0D,
		0x0A,
		0x2D,
		0xB4,
		0x00,
		0x00,
		0x00,
		0x00,
		0x49,
		0x45,
		0x4E,
		0x44,
		0xAE,
		0x42,
		0x60,
		0x82,
	])

	constructor() {
		const options: HealthCheckOptions = {
			timeout: 5000, // 5 second timeout for image processing
			threshold: 0.95,
		}
		super('sharp', options)
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		return this.executeWithTimeout(async () => {
			const startTime = Date.now()

			try {
				// Test 1: Get Sharp version and format support
				const sharpInfo = this.getSharpInfo()

				// Test 2: Process a minimal test image
				const processingResult = await this.testImageProcessing()

				// Test 3: Check memory/cache status
				const cacheStats = sharp.cache()

				const processingTime = Date.now() - startTime

				if (!processingResult.success) {
					return this.createUnhealthyResult(
						`Sharp image processing failed: ${processingResult.error}`,
						{
							...sharpInfo,
							processingTime,
							error: processingResult.error,
						},
					)
				}

				return this.createHealthyResult({
					...sharpInfo,
					processingTime,
					testResult: processingResult,
					cache: {
						memory: cacheStats.memory,
						files: cacheStats.files,
						items: cacheStats.items,
					},
				})
			}
			catch (error: unknown) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error'
				this._logger.error(`Sharp health check failed: ${errorMessage}`)

				return this.createUnhealthyResult(
					`Sharp health check failed: ${errorMessage}`,
					{ error: errorMessage },
				)
			}
		})
	}

	protected getDescription(): string {
		return 'Monitors Sharp image processing library health and capabilities'
	}

	/**
	 * Get Sharp library information
	 */
	private getSharpInfo(): {
		versions: { sharp: string, libvips: string }
		formats: { input: string[], output: string[] }
		simd: boolean
		concurrency: number
	} {
		const format = sharp.format

		const inputFormats = Object.entries(format)
			.filter(([_, info]) => info.input?.file || info.input?.buffer)
			.map(([name]) => name)

		const outputFormats = Object.entries(format)
			.filter(([_, info]) => info.output?.file || info.output?.buffer)
			.map(([name]) => name)

		return {
			versions: {
				sharp: sharp.versions.sharp || 'unknown',
				libvips: sharp.versions.vips || 'unknown',
			},
			formats: {
				input: inputFormats,
				output: outputFormats,
			},
			simd: sharp.simd(),
			concurrency: sharp.concurrency(),
		}
	}

	/**
	 * Test actual image processing capability
	 */
	private async testImageProcessing(): Promise<{
		success: boolean
		inputSize: number
		outputSize: number
		format: string
		error?: string
	}> {
		try {
			// Process the test PNG: resize and convert to WebP
			const result = await sharp(this.testPngBuffer)
				.resize(1, 1)
				.webp({ quality: 80 })
				.toBuffer({ resolveWithObject: true })

			return {
				success: true,
				inputSize: this.testPngBuffer.length,
				outputSize: result.data.length,
				format: result.info.format,
			}
		}
		catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error'
			return {
				success: false,
				inputSize: this.testPngBuffer.length,
				outputSize: 0,
				format: 'unknown',
				error: errorMessage,
			}
		}
	}

	/**
	 * Get current Sharp statistics (for debugging/monitoring)
	 */
	async getSharpStats(): Promise<{
		cache: { memory: number, files: number, items: number }
		counters: { process: number, queue: number }
		simd: boolean
		concurrency: number
	}> {
		const cache = sharp.cache()
		const counters = sharp.counters()

		return {
			cache: {
				memory: typeof cache.memory === 'object' ? cache.memory.current || 0 : (cache.memory || 0),
				files: typeof cache.files === 'object' ? cache.files.current || 0 : (cache.files || 0),
				items: typeof cache.items === 'object' ? cache.items.current || 0 : (cache.items || 0),
			},
			counters: {
				process: counters.process || 0,
				queue: counters.queue || 0,
			},
			simd: sharp.simd(),
			concurrency: sharp.concurrency(),
		}
	}
}
