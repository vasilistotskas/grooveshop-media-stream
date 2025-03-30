import type {
	ResizeOptions,
} from '@microservice/API/DTO/CacheImageRequest'
import type { ResourceIdentifierKP } from '@microservice/Constant/KeyProperties'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { access, readFile, unlink, writeFile } from 'node:fs/promises'
import * as path from 'node:path'
import { cwd } from 'node:process'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	SupportedResizeFormats,
} from '@microservice/API/DTO/CacheImageRequest'
import ResourceMetaData from '@microservice/DTO/ResourceMetaData'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import { HttpService } from '@nestjs/axios'
import { Injectable, InternalServerErrorException, Logger, Scope } from '@nestjs/common'
import UnableToFetchResourceException from '../API/Exception/UnableToFetchResourceException'

@Injectable({ scope: Scope.REQUEST })
export default class CacheImageResourceOperation {
	private readonly logger = new Logger(CacheImageResourceOperation.name)
	private readonly basePath = cwd()

	constructor(
		private readonly httpService: HttpService,
		private readonly validateCacheImageRequest: ValidateCacheImageRequestRule,
		private readonly fetchResourceResponseJob: FetchResourceResponseJob,
		private readonly webpImageManipulationJob: WebpImageManipulationJob,
		private readonly storeResourceResponseToFileJob: StoreResourceResponseToFileJob,
		private readonly generateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob,
	) {}

	request: CacheImageRequest

	id: ResourceIdentifierKP

	metaData: ResourceMetaData

	get getResourcePath(): string {
		return path.join(this.basePath, 'storage', `${this.id}.rsc`)
	}

	get getResourceTempPath(): string {
		return path.join(this.basePath, 'storage', `${this.id}.rst`)
	}

	get getResourceMetaPath(): string {
		return path.join(this.basePath, 'storage', `${this.id}.rsm`)
	}

	get resourceExists(): Promise<boolean> {
		return (async () => {
			try {
				const resourcePathExists = await access(this.getResourcePath).then(() => true).catch(() => false)
				if (!resourcePathExists) {
					this.logger.warn(`Resource path does not exist: ${this.getResourcePath}`)
					return false
				}

				const resourceMetaPathExists = await access(this.getResourceMetaPath).then(() => true).catch(() => false)
				if (!resourceMetaPathExists) {
					this.logger.warn(`Metadata path does not exist: ${this.getResourceMetaPath}`)
					return false
				}

				const headers = await this.getHeaders

				if (!headers) {
					this.logger.warn('Metadata headers are missing or invalid')
					return false
				}

				if (!headers.version || headers.version !== 1) {
					this.logger.warn('Invalid or missing version in metadata')
					return false
				}

				return headers.dateCreated + headers.privateTTL > Date.now()
			}
			catch (error) {
				this.logger.warn(`Error checking resource existence: ${error.message}`)
				return false
			}
		})()
	}

	get getHeaders(): Promise<ResourceMetaData> {
		return (async () => {
			if (!this.metaData) {
				try {
					const exists = await access(this.getResourceMetaPath).then(() => true).catch(() => false)
					if (exists) {
						const content = await readFile(this.getResourceMetaPath, 'utf8')
						this.metaData = new ResourceMetaData(JSON.parse(content))
					}
					else {
						this.logger.warn('Metadata file does not exist.')
						return null
					}
				}
				catch (error) {
					this.logger.error(`Failed to read or parse resource metadata: ${error}`)
					return null
				}
			}
			return this.metaData
		})()
	}

	public async setup(cacheImageRequest: CacheImageRequest): Promise<void> {
		this.request = cacheImageRequest
		await this.validateCacheImageRequest.setup(this.request)
		await this.validateCacheImageRequest.apply()
		this.id = await this.generateResourceIdentityFromRequestJob.handle(this.request)
		this.metaData = null
	}

	public async execute(): Promise<void> {
		try {
			if (await this.resourceExists) {
				this.logger.log('Resource already exists.')
				return
			}

			const response = await this.fetchResourceResponseJob.handle(this.request)
			if (!response || response.status === 404) {
				throw new UnableToFetchResourceException(this.request.resourceTarget)
			}

			await this.storeResourceResponseToFileJob.handle(this.request.resourceTarget, this.getResourceTempPath, response)

			if (this.request.resourceTarget.toLowerCase().endsWith('.svg')) {
				this.logger.debug('Processing SVG format.')
				try {
					const svgContent = await readFile(this.getResourceTempPath, 'utf8')
					if (!svgContent.toLowerCase().includes('<svg')) {
						this.logger.warn('The file is not a valid SVG. Serving default WebP image.')
						await this.optimizeAndServeDefaultImage(this.request.resizeOptions)
						return
					}
					await writeFile(this.getResourcePath, svgContent, 'utf8')
					await writeFile(this.getResourceMetaPath, JSON.stringify(new ResourceMetaData({
						version: 1,
						size: Buffer.from(svgContent).length.toString(),
						format: 'svg',
						dateCreated: Date.now(),
						publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
						privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
					})), 'utf8')
				}
				catch (error) {
					this.logger.error(`Failed to process SVG: ${error.message}`)
					throw error
				}
			}
			else {
				const result = await this.webpImageManipulationJob.handle(
					this.getResourceTempPath,
					this.getResourcePath,
					this.request.resizeOptions,
				)

				await writeFile(this.getResourceMetaPath, JSON.stringify(new ResourceMetaData({
					version: 1,
					size: result.size,
					format: result.format,
					dateCreated: Date.now(),
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					privateTTL: 6 * 30 * 24 * 60 * 60 * 1000,
				})), 'utf8')
			}

			try {
				await unlink(this.getResourceTempPath)
			}
			catch (error) {
				this.logger.warn(`Failed to delete temporary file: ${error.message}`)
			}
		}
		catch (error) {
			this.logger.error(`Failed to execute CacheImageResourceOperation: ${error.message}`)
			throw new InternalServerErrorException('Error fetching or processing image.')
		}
	}

	public async optimizeAndServeDefaultImage(resizeOptions: ResizeOptions): Promise<string> {
		const resizeOptionsWithDefaults: ResizeOptions = {
			width: resizeOptions.width || 800,
			height: resizeOptions.height || 600,
			fit: resizeOptions.fit || FitOptions.contain,
			position: resizeOptions.position || PositionOptions.entropy,
			format: resizeOptions.format || SupportedResizeFormats.webp,
			background: resizeOptions.background || BackgroundOptions.white,
			trimThreshold: resizeOptions.trimThreshold || 5,
			quality: resizeOptions.quality || 100,
		}

		const optionsString = this.createOptionsString(resizeOptionsWithDefaults)
		const optimizedPath = path.join(this.basePath, 'storage', `default_optimized_${optionsString}.webp`)

		try {
			await access(optimizedPath)
			return optimizedPath
		}
		catch (error) {
			if (error.code === 'ENOENT') {
				const result = await this.webpImageManipulationJob.handle(
					path.join(this.basePath, 'public', 'default.png'),
					optimizedPath,
					resizeOptionsWithDefaults,
				)

				if (!result) {
					throw new Error('Failed to optimize default image')
				}

				return optimizedPath
			}
			throw error
		}
	}

	private createOptionsString(options: ResizeOptions): string {
		const hash = createHash('md5')
		hash.update(JSON.stringify(options))
		return hash.digest('hex')
	}
}
