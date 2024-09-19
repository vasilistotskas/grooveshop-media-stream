import CacheImageRequest, {
	BackgroundOptions,
	FitOptions,
	PositionOptions,
	SupportedResizeFormats,
} from '@microservice/API/DTO/CacheImageRequest'
import GenerateResourceIdentityFromRequestJob from '@microservice/Job/GenerateResourceIdentityFromRequestJob'
import { cloneDeep } from 'lodash'
import { v5 as uuid5 } from 'uuid'

jest.mock('uuid', () => ({
	v5: jest.fn(),
}))

jest.mock('lodash', () => ({
	cloneDeep: jest.fn(),
}))

describe('generateResourceIdentityFromRequestJob', () => {
	let job: GenerateResourceIdentityFromRequestJob

	beforeEach(() => {
		job = new GenerateResourceIdentityFromRequestJob()
	})

	it('should be defined', () => {
		expect(job).toBeDefined()
	})

	it('should generate a resource identifier using uuid5', async () => {
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

		const clonedRequest = { ...mockRequest }
    ;(cloneDeep as jest.Mock).mockReturnValue(clonedRequest)

		const mockUUID = 'mocked-uuid'
    ;(uuid5 as unknown as jest.Mock).mockReturnValue(mockUUID)

		const result = await job.handle(mockRequest)

		expect(cloneDeep).toHaveBeenCalledWith(mockRequest)
		expect(uuid5).toHaveBeenCalledWith(JSON.stringify(clonedRequest), uuid5.URL)
		expect(result).toBe(mockUUID)
	})
})
