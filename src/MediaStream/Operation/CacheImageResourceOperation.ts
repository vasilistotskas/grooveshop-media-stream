import { HttpService } from '@nestjs/axios'
import { Injectable, Scope, Logger } from '@nestjs/common'
import { existsSync, readFileSync, unlink, writeFileSync } from 'fs'
import ResourceMetaData from '@microservice/DTO/ResourceMetaData'
import CacheImageRequest from '@microservice/API/DTO/CacheImageRequest'
import { ResourceIdentifierKP } from '@microservice/Constant/KeyProperties'
import FetchResourceResponseJob from '@microservice/Job/FetchResourceResponseJob'
import WebpImageManipulationJob from '@microservice/Job/WebpImageManipulationJob'
import ValidateCacheImageRequestRule from '@microservice/Rule/ValidateCacheImageRequestRule'
import StoreResourceResponseToFileJob from '@microservice/Job/StoreResourceResponseToFileJob'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'

@Injectable({ scope: Scope.REQUEST })
export default class CacheImageResourceOperation {
	private readonly logger = new Logger(CacheImageResourceOperation.name)

	constructor(
		private readonly httpService: HttpService,
		private readonly validateCacheImageRequest: ValidateCacheImageRequestRule,
		private readonly fetchResourceResponseJob: FetchResourceResponseJob,
		private readonly webpImageManipulationJob: WebpImageManipulationJob,
		private readonly storeResourceResponseToFileJob: StoreResourceResponseToFileJob,
		private readonly generateResourceIdentityFromRequestJob: GenerateResourceIdentityFromRequestJob
	) {}

	request: CacheImageRequest

	id: ResourceIdentifierKP

	metaData: ResourceMetaData

	get getResourcePath(): string {
		return `${process.cwd()}/storage/${this.id}.rsc`
	}

	get getResourceTempPath(): string {
		return `${process.cwd()}/storage/${this.id}.rst`
	}

	get getResourceMetaPath(): string {
		return `${process.cwd()}/storage/${this.id}.rsm`
	}

	get resourceExists(): boolean {
		if (!existsSync(this.getResourcePath)) return false

		if (!existsSync(this.getResourceMetaPath)) return false

		const headers = this.getHeaders

		if (!headers.version || 1 !== headers.version) return false

		return headers.dateCreated + headers.privateTTL > Date.now()
	}

	get getHeaders(): ResourceMetaData {
		if (null === this.metaData) {
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
			this.request.resizeOptions
		)

		const resourceMetaDataOptions = {
			size: manipulationResult.size,
			format: manipulationResult.format,
			p: this.request.ttl,
			dateCreated: Date.now(),
			publicTTL: 30 * 24 * 60 * 60 * 1000
		} as unknown as ResourceMetaData
		if (this.request.ttl) {
			resourceMetaDataOptions['privateTTL'] = this.request.ttl
		}
		this.metaData = new ResourceMetaData(resourceMetaDataOptions)

		writeFileSync(this.getResourceMetaPath, JSON.stringify(this.metaData))
		unlink(this.getResourceTempPath, (err) => {
			if (null !== err) {
				this.logger.error(err)
			}
		})
	}
}
