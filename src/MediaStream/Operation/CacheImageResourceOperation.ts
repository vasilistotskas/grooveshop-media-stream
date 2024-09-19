import type {
	ResizeOptions,
} from '@microservice/API/DTO/CacheImageRequest'
import type { ResourceIdentifierKP } from '@microservice/Constant/KeyProperties'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { access, readFile, unlink, writeFile } from 'node:fs/promises'
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

@Injectable({ scope: Scope.REQUEST })
export default class CacheImageResourceOperation {
	private readonly logger = new Logger(CacheImageResourceOperation.name)

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
		return `${cwd()}/storage/${this.id}.rsc`
	}

	get getResourceTempPath(): string {
		return `${cwd()}/storage/${this.id}.rst`
	}

	get getResourceMetaPath(): string {
		return `${cwd()}/storage/${this.id}.rsm`
	}

	get resourceExists(): Promise<boolean> {
		return (async () => {
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
		})()
	}

	get getHeaders(): Promise<ResourceMetaData> {
		return (async () => {
			if (!this.metaData) {
				try {
					const exists = await access(this.getResourceMetaPath).then(() => true).catch(() => false)
					if (exists) {
						this.metaData = JSON.parse(await readFile(this.getResourceMetaPath) as unknown as string)
					}
					else {
						this.logger.warn(`Metadata file does not exist: ${this.getResourceMetaPath}`)
						return null
					}
				}
				catch (error) {
					this.logger.error('Failed to read or parse resource metadata', error)
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
		if (await this.resourceExists) {
			this.logger.log('Resource already exists.')
			return
		}

		try {
			const response = await this.fetchResourceResponseJob.handle(this.request)

			if (!response) {
				this.logger.error('Failed to fetch the resource. The response is empty or invalid.')
				return
			}

			await this.storeResourceResponseToFileJob.handle(this.request.resourceTarget, this.getResourceTempPath, response)

			if (this.request.resizeOptions.format === SupportedResizeFormats.svg) {
				this.logger.log('Skipping manipulation for SVG format.')

				let fileContent: string
				try {
					fileContent = await readFile(this.getResourceTempPath, 'utf8')
				}
				catch (error) {
					this.logger.error('Failed to read file content', error)
					throw new InternalServerErrorException('Error fetching or processing image.')
				}

				if (fileContent.trim().startsWith('<svg')) {
					await writeFile(this.getResourcePath, fileContent)

					this.logger.log(`Successfully validated and wrote SVG to resource path: ${this.getResourcePath}`)

					const resourceMetaDataOptions = {
						size: String(Buffer.byteLength(fileContent, 'utf8')),
						format: SupportedResizeFormats.svg,
						dateCreated: Date.now(),
						publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					} as unknown as ResourceMetaData

					this.metaData = new ResourceMetaData(resourceMetaDataOptions)

					await writeFile(this.getResourceMetaPath, JSON.stringify(this.metaData))
				}
				else {
					this.logger.warn('The file is not a valid SVG. Serving default WebP image.')
					const manipulationResult = await this.webpImageManipulationJob.handle(
						this.getResourceTempPath,
						this.getResourcePath,
						this.request.resizeOptions,
					)
					const resourceMetaDataOptions = {
						size: manipulationResult.size,
						format: manipulationResult.format,
						p: this.request.ttl,
						dateCreated: Date.now(),
						publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
					} as unknown as ResourceMetaData

					if (this.request.ttl) {
						resourceMetaDataOptions.privateTTL = this.request.ttl
					}
					this.metaData = new ResourceMetaData(resourceMetaDataOptions)
				}
			}

			else {
				this.logger.log('Processing image manipulation...')
				const manipulationResult = await this.webpImageManipulationJob.handle(
					this.getResourceTempPath,
					this.getResourcePath,
					this.request.resizeOptions,
				)

				const resourceMetaDataOptions = {
					size: manipulationResult.size,
					format: manipulationResult.format,
					p: this.request.ttl,
					dateCreated: Date.now(),
					publicTTL: 12 * 30 * 24 * 60 * 60 * 1000,
				} as unknown as ResourceMetaData

				if (this.request.ttl) {
					resourceMetaDataOptions.privateTTL = this.request.ttl
				}

				this.metaData = new ResourceMetaData(resourceMetaDataOptions)
			}

			await writeFile(this.getResourceMetaPath, JSON.stringify(this.metaData))

			try {
				await unlink(this.getResourceTempPath)
			}
			catch (error) {
				this.logger.error(error)
			}
		}
		catch (error) {
			this.logger.error('Failed to execute CacheImageResourceOperation', error)
			throw new InternalServerErrorException('Error fetching or processing image.')
		}
	}

	public async optimizeAndServeDefaultImage(resizeOptions: ResizeOptions): Promise<string> {
		const optionsString = this.createOptionsString(resizeOptions)
		const optimizedImageName = `default_optimized_${optionsString}.webp`
		const optimizedImagePath = `${cwd()}/storage/${optimizedImageName}`

		const resizeOptionsWithDefaults = {
			...resizeOptions,
			fit: FitOptions.contain,
			position: PositionOptions.entropy,
			format: SupportedResizeFormats.webp,
			background: BackgroundOptions.transparent,
			trimThreshold: 5,
			quality: 100,
		}

		const exists = await access(optimizedImagePath).then(() => true).catch(() => false)
		if (!exists) {
			const defaultImagePath = `${cwd()}/public/default.png`
			await this.webpImageManipulationJob.handle(defaultImagePath, optimizedImagePath, resizeOptionsWithDefaults)
		}

		return optimizedImagePath
	}

	private createOptionsString(resizeOptions: ResizeOptions): string {
		const sortedOptions = Object.keys(resizeOptions).sort().reduce((obj, key) => {
			obj[key] = resizeOptions[key]
			return obj
		}, {})

		const optionsString = JSON.stringify(sortedOptions)

		return createHash('md5').update(optionsString).digest('hex')
	}
}
