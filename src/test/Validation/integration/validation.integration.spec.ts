import { ScheduleModule } from '@nestjs/schedule'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigModule } from '#microservice/Config/config.module'
import { CorrelationModule } from '#microservice/Correlation/correlation.module'
import { InputSanitizationService } from '#microservice/Validation/services/input-sanitization.service'
import { SecurityCheckerService } from '#microservice/Validation/services/security-checker.service'
import { ValidationModule } from '#microservice/Validation/validation.module'

describe('validation Integration', () => {
	let module: TestingModule
	let sanitizationService: InputSanitizationService
	let securityChecker: SecurityCheckerService

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [
				ConfigModule,
				CorrelationModule,
				ScheduleModule.forRoot(),
				ValidationModule,
			],
		}).compile()

		sanitizationService = module.get<InputSanitizationService>(InputSanitizationService)
		securityChecker = module.get<SecurityCheckerService>(SecurityCheckerService)
	})

	afterEach(async () => {
		await module.close()
	})

	it('should be defined', () => {
		expect(sanitizationService).toBeDefined()
		expect(securityChecker).toBeDefined()
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
