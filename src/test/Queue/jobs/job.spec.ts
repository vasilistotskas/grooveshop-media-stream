import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	SupportedResizeFormats,
} from '#microservice/API/dto/cache-image-request.dto'
import GenerateResourceIdentityFromRequestJob from '#microservice/Queue/jobs/generate-resource-identity-from-request.job'
import { beforeEach, describe, expect, it } from 'vitest'

describe('generateResourceIdentityFromRequestJob', () => {
	let job: GenerateResourceIdentityFromRequestJob

	beforeEach(() => {
		job = new GenerateResourceIdentityFromRequestJob()
	})

	it('should be defined', () => {
		expect(job).toBeDefined()
	})

	it('should generate a deterministic resource identifier', async () => {
		const mockRequest = new CacheImageRequest({
			resourceTarget: 'http://localhost/resource',
			resizeOptions: {
				width: 100,
				height: 200,
				fit: FitOptions.contain,
				position: PositionOptions.center,
				format: SupportedResizeFormats.webp,
				background: BackgroundOptions.transparent,
				trimThreshold: 5,
				quality: 100,
			},
		})

		const id1 = await job.handle(mockRequest)
		const id2 = await job.handle(mockRequest)
		expect(id1).toEqual(id2)

		expect(id1).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
		)
	})

	it('produces different UUIDs for the same URL on different tenants', async () => {
		// The legacy `/media/uploads/...` route has no tenant segment in
		// the URL; without `tenantSchema` in the DTO, two tenants
		// requesting the same path would collide in cache + on disk.
		// The field goes through JSON.stringify so the hash diverges.
		const resizeOptions = {
			width: 400,
			height: 300,
			fit: FitOptions.cover,
			position: PositionOptions.center,
			format: SupportedResizeFormats.webp,
			background: BackgroundOptions.transparent,
			trimThreshold: null,
			quality: 90,
		}
		const requestA = new CacheImageRequest({
			resourceTarget: 'http://backend-service/media/uploads/logo.png',
			resizeOptions,
			tenantSchema: 'tenant_a',
		})
		const requestB = new CacheImageRequest({
			resourceTarget: 'http://backend-service/media/uploads/logo.png',
			resizeOptions,
			tenantSchema: 'tenant_b',
		})

		const idA = await job.handle(requestA)
		const idB = await job.handle(requestB)

		expect(idA).not.toEqual(idB)
	})

	it('defaults tenantSchema to "public" for backward compatibility', async () => {
		// Pre-multi-tenant code still constructs CacheImageRequest
		// without passing tenantSchema — default keeps those hashes
		// stable rather than re-bucketing every existing cache entry.
		const request = new CacheImageRequest({
			resourceTarget: 'http://localhost/resource',
		})
		expect(request.tenantSchema).toBe('public')
	})
})
