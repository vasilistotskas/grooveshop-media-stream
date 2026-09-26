import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import { join } from 'node:path'
import { cwd } from 'node:process'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResizeOptions, SupportedResizeFormats } from '#microservice/API/dto/cache-image-request.dto'
import { ImageFormatProcessor } from '#microservice/Cache/operations/image-format-processor.service'
import { UnsupportedSourceFormatError } from '#microservice/common/errors/media-stream.errors'
import { storageDirectory } from '#microservice/common/utils/storage-path.util'
import { ConfigService } from '#microservice/Config/config.service'
import ManipulationJobResult from '#microservice/Processing/dto/manipulation-job-result.dto'
import WebpImageManipulationJob from '#microservice/Processing/jobs/webp-image-manipulation.job'
import { ProcessingAdmissionService } from '#microservice/Processing/services/processing-admission.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

vi.mock('node:fs/promises')

const mockedFs = vi.mocked(fs)

function enoent(): NodeJS.ErrnoException {
	return Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' })
}

function resizeOptions(overrides: Partial<ResizeOptions> = {}): ResizeOptions {
	return new ResizeOptions({ width: 100, height: 100, trimThreshold: 5, ...overrides })
}

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'

describe('imageFormatProcessor', () => {
	let processor: ImageFormatProcessor
	let mockWebpImageManipulationJob: WebpImageManipulationJob
	let admission: { run: ReturnType<typeof vi.fn> }
	let storageDir: string
	const optimized = Buffer.from('optimized-image-data')

	beforeEach(async () => {
		vi.resetAllMocks()
		mockedFs.writeFile.mockResolvedValue()

		mockWebpImageManipulationJob = { handle: vi.fn() } as unknown as WebpImageManipulationJob
		vi.spyOn(mockWebpImageManipulationJob, 'handle').mockResolvedValue({
			format: 'webp',
			size: '1000',
			buffer: optimized,
		} as ManipulationJobResult)

		const configService = createConfigServiceMock()
		storageDir = storageDirectory(configService)

		// Admission is a pass-through here; its queueing is covered by its own spec.
		admission = { run: vi.fn((fn: () => Promise<unknown>) => fn()) }

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ImageFormatProcessor,
				{ provide: WebpImageManipulationJob, useValue: mockWebpImageManipulationJob },
				{ provide: ProcessingAdmissionService, useValue: admission },
				{ provide: ConfigService, useValue: configService },
			],
		}).compile()

		processor = await module.resolve(ImageFormatProcessor)
	})

	describe('processSvg', () => {
		it('serves the sanitised SVG as-is when no dimension is requested (0 = original size)', async () => {
			mockedFs.readFile.mockResolvedValue(`${SVG.slice(0, -6)}<script>alert(1)</script></svg>`)

			const result = await processor.processSvg('/tmp/id.rst', resizeOptions({ width: 0, height: 0 }), 'acme')

			expect(result.metadata.format).toBe('svg')
			expect(result.metadata.tenantSchema).toBe('acme')
			expect(result.data.toString('utf8')).not.toContain('<script')
			expect(result.metadata.size).toBe(String(result.data.length))
			expect(mockWebpImageManipulationJob.handle).not.toHaveBeenCalled()
			// The sanitiser worker holds an admission slot like a Sharp pipeline.
			expect(admission.run).toHaveBeenCalledTimes(1)
		})

		it('sanitises in place and rasterises through the job when a dimension is requested', async () => {
			mockedFs.readFile.mockResolvedValue(SVG)

			const result = await processor.processSvg('/tmp/id.rst', resizeOptions({ width: 100, height: null }), 'acme')

			expect(mockedFs.writeFile).toHaveBeenCalledWith('/tmp/id.rst', expect.stringContaining('<svg'), 'utf8')
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalledWith('/tmp/id.rst', expect.objectContaining({ width: 100 }))
			expect(result.metadata.format).toBe('webp')
			expect(result.metadata.tenantSchema).toBe('acme')
		})

		// Refused, not answered with a default image cached under the source's identity.
		it('rejects a document without an <svg> element before sanitising it', async () => {
			mockedFs.readFile.mockResolvedValueOnce('<foo xmlns="http://www.w3.org/2000/svg"/>')

			await expect(processor.processSvg('/tmp/id.rst', resizeOptions())).rejects.toBeInstanceOf(UnsupportedSourceFormatError)
			expect(admission.run).not.toHaveBeenCalled()
			expect(mockWebpImageManipulationJob.handle).not.toHaveBeenCalled()
		})
	})

	describe('processRaster', () => {
		it('stamps the requesting tenant and the job\'s actual output format', async () => {
			const result = await processor.processRaster('/tmp/id.rst', resizeOptions(), 'acme')

			expect(result.data).toBe(optimized)
			expect(result.metadata).toMatchObject({ version: 1, size: '1000', format: 'webp', tenantSchema: 'acme' })
			expect(result.metadata.publicTTL).toBeGreaterThan(0)
			expect(result.metadata.privateTTL).toBeGreaterThan(0)
		})

		it('defaults to the "public" tenant', async () => {
			const result = await processor.processRaster('/tmp/id.rst', resizeOptions())

			expect(result.metadata.tenantSchema).toBe('public')
		})
	})

	describe('optimizeAndServeDefaultImage', () => {
		it('serves the cached optimized file without touching Sharp', async () => {
			const cached = Buffer.from('cached-default')
			mockedFs.readFile.mockResolvedValue(cached)

			const result = await processor.optimizeAndServeDefaultImage(resizeOptions())

			expect(result).toBe(cached)
			expect(mockedFs.readFile).toHaveBeenCalledWith(expect.stringMatching(/default_optimized_[0-9a-f]{32}\.webp$/))
			expect(mockWebpImageManipulationJob.handle).not.toHaveBeenCalled()
		})

		it('generates from public/default.png and caches under the storage directory when absent', async () => {
			mockedFs.readFile.mockRejectedValue(enoent())
			const options = resizeOptions({ width: 100, height: 100, quality: 100 })

			const result = await processor.optimizeAndServeDefaultImage(options)

			expect(result).toBe(optimized)
			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalledWith(
				join(cwd(), 'public', 'default.png'),
				expect.objectContaining({ width: 100, height: 100, format: 'webp', trimThreshold: 5, quality: 100 }),
			)
			const [writtenPath, writtenData] = mockedFs.writeFile.mock.calls[0]
			expect(writtenPath).toMatch(/default_optimized_[0-9a-f]{32}\.webp$/)
			expect(join(String(writtenPath), '..')).toBe(storageDir)
			expect(writtenData).toBe(optimized)
		})

		it('falls back to 800x600 only for missing dimensions and keeps the request\'s other options', async () => {
			mockedFs.readFile.mockRejectedValue(enoent())

			await processor.optimizeAndServeDefaultImage(resizeOptions({ width: 0, height: null, format: SupportedResizeFormats.png, quality: 55 }))

			expect(mockWebpImageManipulationJob.handle).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ width: 800, height: 600, format: 'png', quality: 55 }),
			)
		})

		it('rethrows read errors other than ENOENT', async () => {
			mockedFs.readFile.mockRejectedValue(Object.assign(new Error('EACCES'), { code: 'EACCES' }))

			await expect(processor.optimizeAndServeDefaultImage(resizeOptions())).rejects.toThrow('EACCES')
			expect(mockWebpImageManipulationJob.handle).not.toHaveBeenCalled()
		})
	})
})
