import type { ResizeOptions } from '@microservice/API/DTO/CacheImageRequest'
import ManipulationJobResult from '@microservice/DTO/ManipulationJobResult'
import { Injectable, Scope } from '@nestjs/common'
import sharp from 'sharp'

@Injectable({ scope: Scope.REQUEST })
export default class WebpImageManipulationJob {
	async handle(
		filePathFrom: string,
		filePathTo: string,
		options: ResizeOptions,
	): Promise<ManipulationJobResult> {
		const manipulation = sharp(filePathFrom)

		switch (options.format) {
			case 'jpeg':
				manipulation.jpeg({ quality: options.quality })
				break
			case 'png':
				manipulation.png({ quality: options.quality })
				break
			case 'webp':
				manipulation.webp({ quality: options.quality })
				break
			case 'gif':
				manipulation.gif()
				break
			case 'tiff':
				manipulation.tiff()
				break
			default:
				manipulation.webp({ quality: options.quality })
		}

		const resizeScales: Record<string, number> = {};

		(['width', 'height'] as const).forEach((scale) => {
			const value = options[scale]
			if (value !== null && !Number.isNaN(value)) {
				resizeScales[scale] = Number(value)
			}
		})

		if (Object.keys(resizeScales).length > 0) {
			if (options.trimThreshold !== null && !Number.isNaN(options.trimThreshold)) {
				manipulation.trim({
					background: options.background,
					threshold: Number(options.trimThreshold),
				})
			}

			manipulation.resize({
				...resizeScales,
				fit: options.fit,
				position: options.position,
				background: options.background,
			})
		}

		const manipulatedFile = await manipulation.toFile(filePathTo)

		return new ManipulationJobResult({
			size: String(manipulatedFile.size),
			format: manipulatedFile.format,
		})
	}
}
