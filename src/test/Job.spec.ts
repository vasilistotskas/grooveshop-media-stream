import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	SupportedResizeFormats,
} from '@microservice/API/DTO/CacheImageRequest'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'

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
})
