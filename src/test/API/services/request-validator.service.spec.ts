import type { MockedObject } from 'vitest'
import type { ImageProcessingContext } from '#microservice/API/types/image-source.types'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestValidatorService } from '#microservice/API/services/request-validator.service'
import { InvalidRequestError } from '#microservice/common/errors/media-stream.errors'
import { InputSanitizationService } from '#microservice/Validation/services/input-sanitization.service'
import { SecurityCheckerService } from '#microservice/Validation/services/security-checker.service'

function createContext(params: Record<string, unknown>): ImageProcessingContext {
	return {
		source: {
			name: 'test-source',
			baseUrl: 'http://backend:8000',
			urlPattern: '{baseUrl}/{imagePath}',
			routePattern: ':imagePath+',
			routeParams: Object.keys(params),
		},
		params: params as ImageProcessingContext['params'],
		correlationId: 'test-correlation-id',
	}
}

describe('requestValidatorService', () => {
	let service: RequestValidatorService
	let sanitizer: MockedObject<InputSanitizationService>
	let checker: MockedObject<SecurityCheckerService>

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RequestValidatorService,
				{
					provide: InputSanitizationService,
					useValue: { validateUrl: vi.fn().mockReturnValue(true) },
				},
				{
					provide: SecurityCheckerService,
					useValue: { checkForMaliciousContent: vi.fn().mockResolvedValue(false) },
				},
			],
		}).compile()

		service = module.get(RequestValidatorService)
		sanitizer = module.get(InputSanitizationService)
		checker = module.get(SecurityCheckerService)
	})

	describe('validateRequest', () => {
		it('should pass a clean request', async () => {
			await expect(service.validateRequest(createContext({
				imagePath: 'blog/cover.jpg',
				width: '800',
				height: '600',
				quality: '80',
				trimThreshold: '5',
			}))).resolves.toBeUndefined()
		})

		it('should run the security checker on every string param', async () => {
			await service.validateRequest(createContext({ imagePath: 'a.jpg', width: '10' }))
			expect(checker.checkForMaliciousContent).toHaveBeenCalledWith('a.jpg')
			expect(checker.checkForMaliciousContent).toHaveBeenCalledWith('10')
		})

		it('should reject when a param is flagged as malicious', async () => {
			checker.checkForMaliciousContent.mockResolvedValue(true)

			await expect(service.validateRequest(createContext({ imagePath: '../etc/passwd' })))
				.rejects
				.toThrow(InvalidRequestError)
		})

		it.each([
			['width', 'abc'],
			['height', '-5'],
			['width', '9999999'],
			['quality', '0'],
			['quality', '101'],
			['trimThreshold', '101'],
		])('should reject invalid numeric param %s=%s', async (key, value) => {
			await expect(service.validateRequest(createContext({ [key]: value })))
				.rejects
				.toThrow(InvalidRequestError)
		})

		it('should allow zero width/height (use-original-dimensions contract)', async () => {
			await expect(service.validateRequest(createContext({ width: '0', height: '0' })))
				.resolves
				.toBeUndefined()
		})

		it('should allow missing optional numeric params', async () => {
			await expect(service.validateRequest(createContext({ imagePath: 'a.jpg' })))
				.resolves
				.toBeUndefined()
		})
	})

	describe('validateUrl', () => {
		it('should pass URLs the sanitizer accepts', async () => {
			await expect(service.validateUrl('http://backend:8000/a.jpg', 'cid')).resolves.toBeUndefined()
		})

		it('should reject URLs the sanitizer refuses', async () => {
			sanitizer.validateUrl.mockReturnValue(false)

			await expect(service.validateUrl('javascript:alert(1)', 'cid'))
				.rejects
				.toThrow(InvalidRequestError)
		})
	})
})
