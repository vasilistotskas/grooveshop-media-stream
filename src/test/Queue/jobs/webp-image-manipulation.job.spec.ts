import { Buffer } from 'node:buffer'
import { BackgroundOptions, FitOptions, PositionOptions, ResizeOptions, SupportedResizeFormats } from '@microservice/API/dto/cache-image-request.dto'
import ManipulationJobResult from '@microservice/Queue/dto/manipulation-job-result.dto'
import WebpImageManipulationJob from '@microservice/Queue/jobs/webp-image-manipulation.job'
import * as sharp from 'sharp'

jest.mock('sharp')

describe('webpImageManipulationJob', () => {
	let job: WebpImageManipulationJob
	const mockManipulation = {
		webp: jest.fn().mockReturnThis(),
		jpeg: jest.fn().mockReturnThis(),
		png: jest.fn().mockReturnThis(),
		gif: jest.fn().mockReturnThis(),
		tiff: jest.fn().mockReturnThis(),
		resize: jest.fn().mockReturnThis(),
		trim: jest.fn().mockReturnThis(),
		toBuffer: jest.fn().mockResolvedValue(Buffer.from('test')),
		toFile: jest.fn().mockResolvedValue({ size: 1000, format: 'webp' }),
	}

	beforeEach(() => {
		;(sharp as unknown as jest.Mock).mockReturnValue(mockManipulation)
		job = new WebpImageManipulationJob()
	})

	describe('handle', () => {
		it('should handle webp format with quality', async () => {
			const filePathFrom = 'test.webp'
			const filePathTo = 'test.output.webp'
			const options = new ResizeOptions({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: BackgroundOptions.transparent,
				trimThreshold: 5,
				format: SupportedResizeFormats.webp,
				quality: 80,
			})

			const result = await job.handle(filePathFrom, filePathTo, options)

			expect(sharp).toHaveBeenCalledWith(filePathFrom)
			expect(mockManipulation.resize).toHaveBeenCalledWith({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			expect(mockManipulation.trim).toHaveBeenCalledWith({
				background: { r: 0, g: 0, b: 0, alpha: 0 },
				threshold: 5,
			})
			expect(mockManipulation.webp).toHaveBeenCalledWith({ quality: 80 })
			expect(mockManipulation.toFile).toHaveBeenCalledWith(filePathTo)
			expect(result).toBeInstanceOf(ManipulationJobResult)
			expect(result.size).toBe('1000')
		})

		it('should handle jpeg format with quality', async () => {
			const filePathFrom = 'test.jpeg'
			const filePathTo = 'test.output.jpeg'
			const options = new ResizeOptions({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: BackgroundOptions.transparent,
				trimThreshold: 5,
				format: SupportedResizeFormats.jpeg,
				quality: 80,
			})

			const result = await job.handle(filePathFrom, filePathTo, options)

			expect(sharp).toHaveBeenCalledWith(filePathFrom)
			expect(mockManipulation.resize).toHaveBeenCalledWith({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			expect(mockManipulation.trim).toHaveBeenCalledWith({
				background: { r: 0, g: 0, b: 0, alpha: 0 },
				threshold: 5,
			})
			expect(mockManipulation.jpeg).toHaveBeenCalledWith({ quality: 80 })
			expect(mockManipulation.toFile).toHaveBeenCalledWith(filePathTo)
			expect(result).toBeInstanceOf(ManipulationJobResult)
			expect(result.size).toBe('1000')
		})

		it('should handle png format with quality', async () => {
			const filePathFrom = 'test.png'
			const filePathTo = 'test.output.png'
			const options = new ResizeOptions({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: BackgroundOptions.transparent,
				trimThreshold: 5,
				format: SupportedResizeFormats.png,
				quality: 80,
			})

			const result = await job.handle(filePathFrom, filePathTo, options)

			expect(sharp).toHaveBeenCalledWith(filePathFrom)
			expect(mockManipulation.resize).toHaveBeenCalledWith({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			expect(mockManipulation.trim).toHaveBeenCalledWith({
				background: { r: 0, g: 0, b: 0, alpha: 0 },
				threshold: 5,
			})
			expect(mockManipulation.png).toHaveBeenCalledWith({ quality: 80 })
			expect(mockManipulation.toFile).toHaveBeenCalledWith(filePathTo)
			expect(result).toBeInstanceOf(ManipulationJobResult)
			expect(result.size).toBe('1000')
		})

		it('should handle gif format', async () => {
			const filePathFrom = 'test.gif'
			const filePathTo = 'test.output.gif'
			const options = new ResizeOptions({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: BackgroundOptions.transparent,
				trimThreshold: 5,
				format: SupportedResizeFormats.gif,
				quality: 80,
			})

			const result = await job.handle(filePathFrom, filePathTo, options)

			expect(sharp).toHaveBeenCalledWith(filePathFrom)
			expect(mockManipulation.resize).toHaveBeenCalledWith({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			expect(mockManipulation.trim).toHaveBeenCalledWith({
				background: { r: 0, g: 0, b: 0, alpha: 0 },
				threshold: 5,
			})
			expect(mockManipulation.gif).toHaveBeenCalled()
			expect(mockManipulation.toFile).toHaveBeenCalledWith(filePathTo)
			expect(result).toBeInstanceOf(ManipulationJobResult)
			expect(result.size).toBe('1000')
		})

		it('should handle tiff format', async () => {
			const filePathFrom = 'test.tiff'
			const filePathTo = 'test.output.tiff'
			const options = new ResizeOptions({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: BackgroundOptions.transparent,
				trimThreshold: 5,
				format: SupportedResizeFormats.tiff,
				quality: 80,
			})

			const result = await job.handle(filePathFrom, filePathTo, options)

			expect(sharp).toHaveBeenCalledWith(filePathFrom)
			expect(mockManipulation.resize).toHaveBeenCalledWith({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			expect(mockManipulation.trim).toHaveBeenCalledWith({
				background: { r: 0, g: 0, b: 0, alpha: 0 },
				threshold: 5,
			})
			expect(mockManipulation.tiff).toHaveBeenCalled()
			expect(mockManipulation.toFile).toHaveBeenCalledWith(filePathTo)
			expect(result).toBeInstanceOf(ManipulationJobResult)
			expect(result.size).toBe('1000')
		})

		it('should handle resize with width and height', async () => {
			const filePathFrom = 'test.webp'
			const filePathTo = 'test.output.webp'
			const options = new ResizeOptions({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: BackgroundOptions.transparent,
				trimThreshold: 5,
				format: SupportedResizeFormats.webp,
				quality: 80,
			})

			const result = await job.handle(filePathFrom, filePathTo, options)

			expect(sharp).toHaveBeenCalledWith(filePathFrom)
			expect(mockManipulation.resize).toHaveBeenCalledWith({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			expect(mockManipulation.trim).toHaveBeenCalledWith({
				background: { r: 0, g: 0, b: 0, alpha: 0 },
				threshold: 5,
			})
			expect(mockManipulation.webp).toHaveBeenCalledWith({ quality: 80 })
			expect(mockManipulation.toFile).toHaveBeenCalledWith(filePathTo)
			expect(result).toBeInstanceOf(ManipulationJobResult)
			expect(result.size).toBe('1000')
		})

		it('should handle resize with trim threshold', async () => {
			const filePathFrom = 'test.webp'
			const filePathTo = 'test.output.webp'
			const options = new ResizeOptions({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: BackgroundOptions.transparent,
				trimThreshold: 10,
				format: SupportedResizeFormats.webp,
				quality: 80,
			})

			const result = await job.handle(filePathFrom, filePathTo, options)

			expect(sharp).toHaveBeenCalledWith(filePathFrom)
			expect(mockManipulation.resize).toHaveBeenCalledWith({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			expect(mockManipulation.trim).toHaveBeenCalledWith({
				background: { r: 0, g: 0, b: 0, alpha: 0 },
				threshold: 10,
			})
			expect(mockManipulation.webp).toHaveBeenCalledWith({ quality: 80 })
			expect(mockManipulation.toFile).toHaveBeenCalledWith(filePathTo)
			expect(result).toBeInstanceOf(ManipulationJobResult)
			expect(result.size).toBe('1000')
		})

		it('should handle default format when not specified', async () => {
			const filePathFrom = 'test.webp'
			const filePathTo = 'test.output.webp'
			const options = new ResizeOptions({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: BackgroundOptions.transparent,
				trimThreshold: 5,
				quality: 80,
			})

			const result = await job.handle(filePathFrom, filePathTo, options)

			expect(sharp).toHaveBeenCalledWith(filePathFrom)
			expect(mockManipulation.resize).toHaveBeenCalledWith({
				width: 800,
				height: 600,
				fit: FitOptions.contain,
				position: PositionOptions.entropy,
				background: { r: 0, g: 0, b: 0, alpha: 0 },
			})
			expect(mockManipulation.trim).toHaveBeenCalledWith({
				background: { r: 0, g: 0, b: 0, alpha: 0 },
				threshold: 5,
			})
			expect(mockManipulation.webp).toHaveBeenCalledWith({ quality: 80 })
			expect(mockManipulation.toFile).toHaveBeenCalledWith(filePathTo)
			expect(result).toBeInstanceOf(ManipulationJobResult)
			expect(result.size).toBe('1000')
		})
	})
})
