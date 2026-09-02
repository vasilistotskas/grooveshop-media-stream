import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ResourceValidationService } from '#microservice/Validation/services/resource-validation.service'
import { SecurityCheckerService } from '#microservice/Validation/services/security-checker.service'
import { ValidationModule } from '#microservice/Validation/validation.module'

describe('validation Integration', () => {
	let module: TestingModule
	let resourceValidation: ResourceValidationService
	let securityChecker: SecurityCheckerService

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [ValidationModule],
		}).compile()

		resourceValidation = module.get(ResourceValidationService)
		securityChecker = module.get(SecurityCheckerService)
	})

	afterEach(async () => {
		await module.close()
	})

	it('should be defined', () => {
		expect(resourceValidation).toBeDefined()
		expect(securityChecker).toBeDefined()
	})

	describe('security Features', () => {
		it('should detect various attack patterns', () => {
			const attackPatterns = [
				'<script>alert("xss")</script>',
				'javascript:alert(1)',
				'\'; DROP TABLE users; --',
				'../../../etc/passwd',
			]

			for (const pattern of attackPatterns) {
				expect(securityChecker.checkForMaliciousContent(pattern)).toBe(true)
			}
		})
	})
})
