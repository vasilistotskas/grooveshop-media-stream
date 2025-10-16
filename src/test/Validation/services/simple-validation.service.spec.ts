import type { MockedObject } from 'vitest'
import CacheImageRequest, { ResizeOptions, SupportedResizeFormats } from '@microservice/API/dto/cache-image-request.dto'
import { ConfigService } from '@microservice/Config/config.service'
import { CorrelationService } from '@microservice/Correlation/services/correlation.service'
import { InputSanitizationService } from '@microservice/Validation/services/input-sanitization.service'
import { SecurityCheckerService } from '@microservice/Validation/services/security-checker.service'
import { SimpleValidationService } from '@microservice/Validation/services/simple-validation.service'
import { Test, TestingModule } from '@nestjs/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('simpleValidationService', () => {
	let service: SimpleValidationService
	let sanitizationService: MockedObject<InputSanitizationService>
	let securityChecker: MockedObject<SecurityCheckerService>

	beforeEach(async () => {
		const mockConfigService = {
			getOptional: vi.fn(),
		}

		const mockCorrelationService = {
			getCorrelationId: vi.fn().mockReturnValue('test-correlation-id'),
			getClientIp: vi.fn().mockReturnValue('127.0.0.1'),
			getUserAgent: vi.fn().mockReturnValue('test-agent'),
		}

		const mockSanitizationService = {
			sanitize: vi.fn(),
			validateUrl: vi.fn(),
			validateImageDimensions: vi.fn(),
		}

		const mockSecurityChecker = {
			checkForMaliciousContent: vi.fn(),
			logSecurityEvent: vi.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				SimpleValidationService,
				{ provide: ConfigService, useValue: mockConfigService },
				{ provide: CorrelationService, useValue: mockCorrelationService },
				{ provide: InputSanitizationService, useValue: mockSanitizationService },
				{ provide: SecurityCheckerService, useValue: mockSecurityChecker },
			],
		}).compile()

		service = module.get<SimpleValidationService>(SimpleValidationService)
		sanitizationService = module.get(InputSanitizationService)
		securityChecker = module.get(SecurityCheckerService)

		// Setup default mocks
		sanitizationService.sanitize.mockImplementation(async input => input)
		sanitizationService.validateUrl.mockReturnValue(true)
		sanitizationService.validateImageDimensions.mockReturnValue(true)
		securityChecker.checkForMaliciousContent.mockResolvedValue(false)
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('validateCacheImageRequest', () => {
		let validRequest: CacheImageRequest

		beforeEach(() => {
			validRequest = new CacheImageRequest({
				resourceTarget: 'https://example.com/image.jpg',
				ttl: 3600,
				resizeOptions: new ResizeOptions({
					width: 800,
					height: 600,
					format: SupportedResizeFormats.webp,
					quality: 80,
				}),
			})
		})

		it('should validate a valid request', async () => {
			const result = await service.validateCacheImageRequest(validRequest)

			expect(result.isValid).toBe(true)
			expect(result.errors).toHaveLength(0)
			expect(result.sanitizedInput).toBeDefined()
		})

		it('should reject malicious requests', async () => {
			securityChecker.checkForMaliciousContent.mockResolvedValue(true)

			const result = await service.validateCacheImageRequest(validRequest)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain('Request contains potentially malicious content')
			expect(securityChecker.logSecurityEvent).toHaveBeenCalled()
		})

		it('should reject invalid URLs', async () => {
			sanitizationService.validateUrl.mockReturnValue(false)

			const result = await service.validateCacheImageRequest(validRequest)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain('Invalid or disallowed URL')
		})

		it('should reject invalid image dimensions', async () => {
			sanitizationService.validateImageDimensions.mockReturnValue(false)

			const result = await service.validateCacheImageRequest(validRequest)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain('Image dimensions exceed allowed limits')
		})

		it('should handle validation errors gracefully', async () => {
			securityChecker.checkForMaliciousContent.mockRejectedValue(new Error('Service error'))

			const result = await service.validateCacheImageRequest(validRequest)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain('Validation service error')
		})
	})

	describe('validateInput', () => {
		it('should validate safe input', async () => {
			const input = { test: 'safe content' }

			const result = await service.validateInput(input)

			expect(result.isValid).toBe(true)
			expect(result.errors).toHaveLength(0)
			expect(result.sanitizedInput).toEqual(input)
		})

		it('should reject malicious input', async () => {
			securityChecker.checkForMaliciousContent.mockResolvedValue(true)

			const result = await service.validateInput({ malicious: 'content' })

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain('Input contains potentially malicious content')
		})

		it('should handle input validation errors gracefully', async () => {
			securityChecker.checkForMaliciousContent.mockRejectedValue(new Error('Service error'))

			const result = await service.validateInput({ test: 'input' })

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain('Input validation service error')
		})
	})
})
