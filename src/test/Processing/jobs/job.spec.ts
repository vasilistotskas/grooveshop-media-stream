import { beforeEach, describe, expect, it } from 'vitest'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	ResizeOptions,
	SupportedResizeFormats,
} from '#microservice/API/dto/cache-image-request.dto'
import GenerateResourceIdentityFromRequestJob from '#microservice/Processing/jobs/generate-resource-identity-from-request.job'

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

	it('keeps the request identity stable across refactors (golden UUID)', async () => {
		// Any change to the JSON fed into the UUIDv5 hash re-keys every cached
		// entry (memory, Redis and the on-disk .rsc/.rsm pairs). Pinning the
		// value makes such a change an explicit, reviewed decision. The request
		// is built exactly the way the controller builds it.
		const request = new CacheImageRequest({
			resourceTarget: 'http://backend-service/media/acme/uploads/blog/post/cover.jpg',
			resizeOptions: new ResizeOptions({
				width: 800,
				height: 600,
				fit: FitOptions.cover,
				position: PositionOptions.entropy,
				format: SupportedResizeFormats.webp,
				background: '#ff00aa80',
				trimThreshold: 5,
				quality: 80,
			}),
			tenantSchema: 'acme',
		})

		expect(await job.handle(request)).toBe('73ea4b9c-8730-5d77-b751-5a194b88809a')
	})

	it('produces different UUIDs for the same URL on different tenants', async () => {
		// The shared `/static/images/...` route has no tenant segment in
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
			resourceTarget: 'http://backend-service/static/images/logo.png',
			resizeOptions,
			tenantSchema: 'tenant_a',
		})
		const requestB = new CacheImageRequest({
			resourceTarget: 'http://backend-service/static/images/logo.png',
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
