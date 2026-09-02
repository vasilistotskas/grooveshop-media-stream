import type { HealthIndicatorResult } from '@nestjs/terminus'
import { Buffer } from 'node:buffer'
import { Injectable } from '@nestjs/common'
import sharp from 'sharp'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { BaseHealthIndicator } from '../base/base-health-indicator.js'

/** Image processing may legitimately take a while under load. */
const TIMEOUT_MS = 5000

/** A 1×1 transparent PNG, decoded once: the smallest input that exercises the full Sharp pipeline. */
const TEST_PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==',
	'base64',
)

@Injectable()
export class SharpHealthIndicator extends BaseHealthIndicator {
	constructor() {
		super('sharp', TIMEOUT_MS)
	}

	protected async performHealthCheck(): Promise<HealthIndicatorResult> {
		return this.executeWithTimeout(async () => {
			const startTime = Date.now()
			const sharpInfo = this.getSharpInfo()
			const processingResult = await this.testImageProcessing()
			const cacheStats = sharp.cache()
			const processingTime = Date.now() - startTime

			if (!processingResult.success) {
				return this.createUnhealthyResult(`Sharp image processing failed: ${processingResult.error}`, {
					...sharpInfo,
					processingTime,
					error: processingResult.error,
				})
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
		})
	}

	protected getDescription(): string {
		return 'Monitors Sharp image processing library health and capabilities'
	}

	private getSharpInfo(): {
		versions: { sharp: string, libvips: string }
		formats: { input: string[], output: string[] }
		simd: boolean
		concurrency: number
	} {
		const formats = Object.entries(sharp.format)

		return {
			versions: {
				sharp: sharp.versions.sharp || 'unknown',
				libvips: sharp.versions.vips || 'unknown',
			},
			formats: {
				input: formats.filter(([, info]) => info.input?.file || info.input?.buffer).map(([name]) => name),
				output: formats.filter(([, info]) => info.output?.file || info.output?.buffer).map(([name]) => name),
			},
			simd: sharp.simd(),
			concurrency: sharp.concurrency(),
		}
	}

	private async testImageProcessing(): Promise<{
		success: boolean
		inputSize: number
		outputSize: number
		format: string
		error?: string
	}> {
		try {
			const result = await sharp(TEST_PNG)
				.resize(1, 1)
				.webp({ quality: 80 })
				.toBuffer({ resolveWithObject: true })

			return {
				success: true,
				inputSize: TEST_PNG.length,
				outputSize: result.data.length,
				format: result.info.format,
			}
		}
		catch (error: unknown) {
			return {
				success: false,
				inputSize: TEST_PNG.length,
				outputSize: 0,
				format: 'unknown',
				error: errorMessage(error),
			}
		}
	}
}
