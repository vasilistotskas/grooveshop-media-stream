import type { MockedObject } from 'vitest'
import type { ImageProcessingContext, ImageProcessingParams } from '#microservice/API/types/image-source.types'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestValidatorService } from '#microservice/API/services/request-validator.service'
import { InvalidRequestError } from '#microservice/common/errors/media-stream.errors'
import { ResourceValidationService } from '#microservice/Validation/services/resource-validation.service'
import { SecurityCheckerService } from '#microservice/Validation/services/security-checker.service'

function createContext(params: ImageProcessingParams): ImageProcessingContext {
	return {
		source: {
			name: 'test-source',
			urlPattern: '{baseUrl}/{imagePath}',
			routePattern: ':imagePath+',
			routeParams: Object.keys(params),
		},
		params,
		correlationId: 'test-correlation-id',
	}
}

describe('requestValidatorService', () => {
	let service: RequestValidatorService
	let resourceValidation: MockedObject<ResourceValidationService>
	let checker: MockedObject<SecurityCheckerService>

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				RequestValidatorService,
				{
					provide: ResourceValidationService,
					useValue: { validateUrl: vi.fn().mockReturnValue(true) },
				},
				{
					provide: SecurityCheckerService,
					useValue: { checkForMaliciousContent: vi.fn().mockReturnValue(false) },
				},
			],
		}).compile()

		service = module.get(RequestValidatorService)
		resourceValidation = module.get(ResourceValidationService)
		checker = module.get(SecurityCheckerService)
	})

	describe('validateRequest', () => {
		it('should pass a clean request', () => {
			expect(() => service.validateRequest(createContext({
				imagePath: 'blog/cover.jpg',
				width: '800',
				height: '600',
				quality: '80',
				trimThreshold: '5',
			}))).not.toThrow()
		})

		it('should run the security checker on every string param', () => {
			service.validateRequest(createContext({ imagePath: 'a.jpg', width: '10' }))
			expect(checker.checkForMaliciousContent).toHaveBeenCalledWith('a.jpg')
			expect(checker.checkForMaliciousContent).toHaveBeenCalledWith('10')
		})

		it('should reject when a param is flagged as malicious', () => {
			checker.checkForMaliciousContent.mockReturnValue(true)

			expect(() => service.validateRequest(createContext({ imagePath: '../etc/passwd' })))
				.toThrow(InvalidRequestError)
		})

		it.each([
			['width', 'abc'],
			['height', '-5'],
			['width', '9999999'],
			['quality', '0'],
			['quality', '101'],
			['trimThreshold', '101'],
		])('should reject invalid numeric param %s=%s', (key, value) => {
			expect(() => service.validateRequest(createContext({ [key]: value })))
				.toThrow(InvalidRequestError)
		})

		it('should allow zero width/height (use-original-dimensions contract)', () => {
			expect(() => service.validateRequest(createContext({ width: '0', height: '0' }))).not.toThrow()
		})

		it('should allow missing optional numeric params', () => {
			expect(() => service.validateRequest(createContext({ imagePath: 'a.jpg' }))).not.toThrow()
		})

		it('should reject a resize target above the total pixel budget even when each axis is in range', () => {
			expect(() => service.validateRequest(createContext({ width: '8192', height: '8192' })))
				.toThrow(InvalidRequestError)
		})

		it('should accept a resize target exactly at the total pixel budget', () => {
			expect(() => service.validateRequest(createContext({ width: '7680', height: '4320' }))).not.toThrow()
		})

		it('should not count a zero axis against the pixel budget', () => {
			expect(() => service.validateRequest(createContext({ width: '8192', height: '0' }))).not.toThrow()
		})

		it.each([
			['width', 'null'],
			['height', 'null'],
			['quality', 'null'],
			['trimThreshold', 'null'],
		])('rejects the literal string "null" for numeric param %s', (key, value) => {
			expect(() => service.validateRequest(createContext({ [key]: value })))
				.toThrow(InvalidRequestError)
		})

		it.each([
			['fit', 'null'],
			['fit', 'banana'],
			['position', 'null'],
			['position', 'url(javascript:1)'],
			['format', 'null'],
			['format', 'exe'],
		])('rejects invalid enum param %s=%s with 400 instead of letting Sharp 500', (key, value) => {
			expect(() => service.validateRequest(createContext({ [key]: value })))
				.toThrow(InvalidRequestError)
		})

		it.each([
			['fit', 'cover'],
			['position', 'attention'],
			['format', 'avif'],
		])('accepts valid enum param %s=%s', (key, value) => {
			expect(() => service.validateRequest(createContext({ [key]: value }))).not.toThrow()
		})

		it.each([
			['acme'],
			['tenant_1'],
			['_private'],
		])('accepts a valid tenantSchema %s', (tenantSchema) => {
			expect(() => service.validateRequest(createContext({ tenantSchema }))).not.toThrow()
		})

		it.each([
			['Acme'],
			['tenant-1'],
			['1tenant'],
			['a'.repeat(64)],
		])('rejects an invalid tenantSchema %s', (tenantSchema) => {
			expect(() => service.validateRequest(createContext({ tenantSchema })))
				.toThrow(InvalidRequestError)
		})
	})

	describe('validateUrl', () => {
		it('should pass URLs the resource validator accepts', () => {
			expect(() => service.validateUrl('http://backend:8000/a.jpg', 'cid')).not.toThrow()
		})

		it('should reject URLs the resource validator refuses', () => {
			resourceValidation.validateUrl.mockReturnValue(false)

			expect(() => service.validateUrl('javascript:alert(1)', 'cid')).toThrow(InvalidRequestError)
		})
	})
})
