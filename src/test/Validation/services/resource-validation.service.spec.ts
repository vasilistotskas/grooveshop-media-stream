import type { MockedObject } from 'vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ResourceValidationService } from '#microservice/Validation/services/resource-validation.service'
import { TenantDomainsService } from '#microservice/Validation/services/tenant-domains.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

const ALLOWED_DOMAINS = ['localhost', '127.0.0.1', 'example.com', 'test.com', 'grooveshop.com']

describe('resourceValidationService', () => {
	let service: ResourceValidationService
	let tenantDomainsService: MockedObject<TenantDomainsService>

	// The allowlist is read once in the constructor, so a test that needs a
	// different list builds its own service.
	function createService(allowedDomains: string[] = ALLOWED_DOMAINS): ResourceValidationService {
		return new ResourceValidationService(
			createConfigServiceMock({ 'validation.allowedDomains': allowedDomains }),
			tenantDomainsService,
		)
	}

	beforeEach(() => {
		tenantDomainsService = {
			isAllowed: vi.fn().mockReturnValue(false),
		} as unknown as MockedObject<TenantDomainsService>
		service = createService()
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('validateUrl', () => {
		it('should accept valid URLs from allowed domains', () => {
			expect(service.validateUrl('https://example.com/image.jpg')).toBe(true)
			expect(service.validateUrl('http://localhost:3000/test.png')).toBe(true)
		})

		it('should accept every hostname supplied by the configured domain list', () => {
			// Regression test for the production failure where configured public
			// hostnames were dropped — any upstream fetch from a host the operator
			// listed must be accepted. The list is configuration (both overlays set
			// VALIDATION_ALLOWED_DOMAINS in full), never a source constant.
			const serviceWithProductionDefaults = createService([
				'localhost',
				'127.0.0.1',
				'backend-service',
				'static-svc',
				'frontend-nuxt-service',
				'media-stream-service',
				'store.example.com',
				'api.example.com',
				'assets.example.com',
				'static.example.com',
			])

			expect(serviceWithProductionDefaults.validateUrl('https://store.example.com/media/public/uploads/image.jpg')).toBe(true)
			expect(serviceWithProductionDefaults.validateUrl('https://api.example.com/media/tenant/uploads/img.jpg')).toBe(true)
			expect(serviceWithProductionDefaults.validateUrl('https://assets.example.com/static/images/logo.png')).toBe(true)
			expect(serviceWithProductionDefaults.validateUrl('https://static.example.com/static/images/hero.webp')).toBe(true)
		})

		it('should reject URLs from non-allowed domains', () => {
			expect(service.validateUrl('https://malicious.com/image.jpg')).toBe(false)
			expect(service.validateUrl('http://evil.org/test.png')).toBe(false)
		})

		it('should reject non-HTTP protocols', () => {
			expect(service.validateUrl('ftp://example.com/file.jpg')).toBe(false)
			expect(service.validateUrl('javascript:alert(1)')).toBe(false)
			expect(service.validateUrl('data:image/png;base64,abc')).toBe(false)
			expect(service.validateUrl('file:///etc/passwd')).toBe(false)
		})

		it('should handle invalid URL formats', () => {
			expect(service.validateUrl('not-a-url')).toBe(false)
			expect(service.validateUrl('')).toBe(false)
			expect(service.validateUrl('://invalid')).toBe(false)
		})

		it('should accept subdomains of allowed domains', () => {
			expect(service.validateUrl('https://cdn.example.com/image.jpg')).toBe(true)
			expect(service.validateUrl('https://api.test.com/resource')).toBe(true)
		})

		it('should match allowed domains case-insensitively regardless of operator env casing', () => {
			// Regression: URL.hostname is always lowercase, so a mixed-case
			// VALIDATION_ALLOWED_DOMAINS value must still match.
			const mixedCaseService = createService(['Example.COM', 'API.Example.NET'])

			expect(mixedCaseService.validateUrl('https://example.com/image.jpg')).toBe(true)
			expect(mixedCaseService.validateUrl('https://cdn.example.com/image.jpg')).toBe(true)
			expect(mixedCaseService.validateUrl('https://api.example.net/image.jpg')).toBe(true)
		})

		it('accepts a hostname allowed only by the dynamic tenant domain set (union semantics)', () => {
			tenantDomainsService.isAllowed.mockImplementation((domain: string) => domain === 'acme.example')

			expect(service.validateUrl('https://acme.example/media/acme/uploads/banner.jpg')).toBe(true)
			expect(tenantDomainsService.isAllowed).toHaveBeenCalledWith('acme.example')
		})

		it('still rejects a hostname absent from both the static and dynamic allowlists', () => {
			tenantDomainsService.isAllowed.mockReturnValue(false)

			expect(service.validateUrl('https://not-a-tenant.example/image.jpg')).toBe(false)
		})

		it('accepts a hostname present in the static list even when the dynamic set is disabled/empty', () => {
			tenantDomainsService.isAllowed.mockReturnValue(false)

			expect(service.validateUrl('https://example.com/image.jpg')).toBe(true)
		})
	})

	describe('validateFileSize', () => {
		it('should accept files within size limits', () => {
			expect(service.validateFileSize(1024 * 1024)).toBe(true) // 1MB
			expect(service.validateFileSize(2 * 1024 * 1024, 'jpeg')).toBe(true) // 2MB JPEG
		})

		it('should reject files exceeding size limits', () => {
			expect(service.validateFileSize(20 * 1024 * 1024)).toBe(false) // 20MB
			expect(service.validateFileSize(10 * 1024 * 1024, 'jpeg')).toBe(false) // 10MB JPEG
		})

		it('should reject zero or negative sizes', () => {
			expect(service.validateFileSize(0)).toBe(false)
			expect(service.validateFileSize(-1000)).toBe(false)
		})

		it('should use format-specific limits', () => {
			expect(service.validateFileSize(6 * 1024 * 1024, 'jpeg')).toBe(false) // 6MB JPEG (limit 5MB)
			expect(service.validateFileSize(6 * 1024 * 1024, 'png')).toBe(true) // 6MB PNG (limit 8MB)
		})
	})
})
