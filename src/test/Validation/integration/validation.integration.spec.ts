import { ScheduleModule } from '@nestjs/schedule'
import { Test, TestingModule } from '@nestjs/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RedisCacheService } from '#microservice/Cache/services/redis-cache.service'
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

	it('should inject RedisCacheService into SecurityCheckerService', () => {
		// The `RedisCacheService | null` union erases design:paramtypes to
		// `Object`, so without the explicit @Inject token Nest has nothing to
		// resolve and @Optional() quietly injects undefined — which disables
		// cross-replica security-event persistence with no error anywhere.
		const injected = (securityChecker as unknown as {
			_redisCacheService: RedisCacheService | null
		})._redisCacheService

		expect(injected).toBeInstanceOf(RedisCacheService)
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

			// getSecurityStats was removed as test-only surface; assert the
			// private in-memory buffer directly instead.
			const events = (securityChecker as any).securityEvents
			expect(events.length).toBeGreaterThan(0)
		})
	})
})
