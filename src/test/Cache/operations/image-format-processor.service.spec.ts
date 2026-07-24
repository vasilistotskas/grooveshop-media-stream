import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '#microservice/API/dto/cache-image-request.dto'
import { ImageFormatProcessor } from '#microservice/Cache/operations/image-format-processor.service'
import { ConfigService } from '#microservice/Config/config.service'
import ManipulationJobResult from '#microservice/Processing/dto/manipulation-job-result.dto'
import WebpImageManipulationJob from '#microservice/Processing/jobs/webp-image-manipulation.job'

vi.mock('node:fs/promises')
vi.mock('node:process', () => ({
	cwd: vi.fn(() => '/mock/cwd'),
}))

// Regression coverage for H21 (MULTI_TENANT_AUDIT.md): cache warming reads
// `metadata.tenantSchema` off the persisted `.rsm` file, so every code path
// that builds a ResourceMetaData must stamp the requesting tenant onto it.
describe('imageFormatProcessor — tenantSchema metadata propagation (H21 regression)', () => {
	let processor: ImageFormatProcessor
	let mockWebpImageManipulationJob: WebpImageManipulationJob

	function resizeOptionsWithSize(width: number | null, height: number | null): ResizeOptions {
		const options = new ResizeOptions()
		options.width = width
		options.height = height
		options.fit = FitOptions.contain
		options.position = PositionOptions.entropy
		options.format = SupportedResizeFormats.webp
		options.background = BackgroundOptions.white
		options.trimThreshold = 5
		options.quality = 80
		return options
	}

	beforeEach(async () => {
		mockWebpImageManipulationJob = {
			handle: vi.fn(),
		} as unknown as WebpImageManipulationJob
		vi.spyOn(mockWebpImageManipulationJob, 'handle').mockResolvedValue({
			format: 'webp',
			size: '1000',
			buffer: Buffer.from('optimized-image-data'),
		} as ManipulationJobResult)

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				ImageFormatProcessor,
				{ provide: WebpImageManipulationJob, useValue: mockWebpImageManipulationJob },
				{
					provide: ConfigService,
					useValue: {
						getOptional: vi.fn().mockImplementation((_key: string, defaultValue: any) => defaultValue),
					},
				},
			],
		}).compile()

		processor = await module.resolve(ImageFormatProcessor)
	})

	it('stamps the requesting tenant onto raster-processed metadata', async () => {
		const result = await processor.processRaster('/mock/cwd/storage/id.rst', resizeOptionsWithSize(100, 100), 'acme')

		expect(result.metadata.tenantSchema).toBe('acme')
	})

	it('defaults to the "public" tenant when processRaster is called without a tenantSchema', async () => {
		const result = await processor.processRaster('/mock/cwd/storage/id.rst', resizeOptionsWithSize(100, 100))

		expect(result.metadata.tenantSchema).toBe('public')
	})

	it('stamps the requesting tenant onto pass-through (non-resized) SVG metadata', async () => {
		const mockedFs = vi.mocked(fs)
		mockedFs.readFile.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')

		const result = await processor.processSvg('/mock/cwd/storage/id.rst', resizeOptionsWithSize(null, null), 'acme')

		expect(result.metadata.format).toBe('svg')
		expect(result.metadata.tenantSchema).toBe('acme')
	})

	it('stamps the requesting tenant onto resized SVG metadata (rasterized via Sharp)', async () => {
		const mockedFs = vi.mocked(fs)
		mockedFs.readFile.mockResolvedValue('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')
		mockedFs.writeFile.mockResolvedValue()

		const result = await processor.processSvg('/mock/cwd/storage/id.rst', resizeOptionsWithSize(100, 100), 'acme')

		expect(result.metadata.tenantSchema).toBe('acme')
	})

	it('stamps the requesting tenant onto the default-image fallback metadata', async () => {
		const mockedFs = vi.mocked(fs)
		mockedFs.access.mockRejectedValue({ code: 'ENOENT' } as NodeJS.ErrnoException)
		mockedFs.writeFile.mockResolvedValue()

		const result = await processor.processDefault(resizeOptionsWithSize(100, 100), 'acme')

		expect(result.metadata.tenantSchema).toBe('acme')
	})

	it('falls back to "public" when an invalid SVG is served through processSvg without a tenantSchema', async () => {
		const mockedFs = vi.mocked(fs)
		mockedFs.readFile.mockResolvedValue('not an svg document')
		mockedFs.access.mockRejectedValue({ code: 'ENOENT' } as NodeJS.ErrnoException)
		mockedFs.writeFile.mockResolvedValue()

		const result = await processor.processSvg('/mock/cwd/storage/id.rst', resizeOptionsWithSize(100, 100))

		expect(result.metadata.format).toBe('webp')
		expect(result.metadata.tenantSchema).toBe('public')
	})
})
