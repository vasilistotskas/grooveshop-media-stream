import { randomUUID } from 'node:crypto'
import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	SupportedResizeFormats,
} from '@microservice/API/DTO/CacheImageRequest'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'

jest.mock('node:crypto', () => ({
	randomUUID: jest.fn(),
}))

describe('generateResourceIdentityFromRequestJob', () => {
	let job: GenerateResourceIdentityFromRequestJob

	beforeEach(() => {
		job = new GenerateResourceIdentityFromRequestJob()
	})

	it('should be defined', () => {
		expect(job).toBeDefined()
	})

	it('should generate a resource identifier using randomUUID', async () => {
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

		const mockUUID = 'mocked-uuid'
    ;(randomUUID as jest.Mock).mockReturnValue(mockUUID)

		const result = await job.handle(mockRequest)

		expect(randomUUID).toHaveBeenCalled()
		expect(result).toBe(mockUUID)
	})
})
