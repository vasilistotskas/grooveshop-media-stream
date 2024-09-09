import { createHash } from 'node:crypto'
import { existsSync, readFileSync, unlink, writeFileSync } from 'node:fs'
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
import { Injectable, Logger, Scope } from '@nestjs/common'
import type {
	ResizeOptions,
} from '@microservice/API/DTO/CacheImageRequest'
import type { ResourceIdentifierKP } from '@microservice/Constant/KeyProperties'

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

	get resourceExists(): boolean {
		if (!existsSync(this.getResourcePath))
			return false

		if (!existsSync(this.getResourceMetaPath))
			return false

		const headers = this.getHeaders

		if (!headers.version || headers.version !== 1)
			return false

		return headers.dateCreated + headers.privateTTL > Date.now()
	}

	get getHeaders(): ResourceMetaData {
		if (this.metaData === null) {
			this.metaData = JSON.parse(readFileSync(this.getResourceMetaPath) as unknown as string)
		}

		return this.metaData
	}

	public async setup(cacheImageRequest: CacheImageRequest): Promise<void> {
		this.request = cacheImageRequest
		await this.validateCacheImageRequest.setup(this.request)
		await this.validateCacheImageRequest.apply()
		this.id = await this.generateResourceIdentityFromRequestJob.handle(this.request)
		this.metaData = null
	}

	public async execute(): Promise<void> {
		if (this.resourceExists) {
			return
		}

		const response = await this.fetchResourceResponseJob.handle(this.request)
		await this.storeResourceResponseToFileJob.handle(this.request.resourceTarget, this.getResourceTempPath, response)
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

		writeFileSync(this.getResourceMetaPath, JSON.stringify(this.metaData))
		unlink(this.getResourceTempPath, (err) => {
			if (err !== null) {
				this.logger.error(err)
			}
		})
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

		if (!existsSync(optimizedImagePath)) {
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
