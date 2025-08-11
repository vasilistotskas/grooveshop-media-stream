import { Test, TestingModule } from '@nestjs/testing'
import { ConfigService } from '../../../MediaStream/Config/config.service'
import { InputSanitizationService } from '../../../MediaStream/Validation/services/input-sanitization.service'

describe('inputSanitizationService', () => {
	let service: InputSanitizationService
	let configService: jest.Mocked<ConfigService>

	beforeEach(async () => {
		const mockConfigService = {
			getOptional: jest.fn(),
		}

		const module: TestingModule = await Test.createTestingModule({
			providers: [
				InputSanitizationService,
				{ provide: ConfigService, useValue: mockConfigService },
			],
		}).compile()

		service = module.get<InputSanitizationService>(InputSanitizationService)
		configService = module.get(ConfigService)

		// Setup default config responses
		configService.getOptional.mockImplementation((key, defaultValue) => {
			const configs = {
				'validation.allowedDomains': ['localhost', '127.0.0.1', 'example.com', 'test.com', 'grooveshop.com'],
				'validation.maxFileSizes': {
					default: 10 * 1024 * 1024,
					jpeg: 5 * 1024 * 1024,
					png: 8 * 1024 * 1024,
				},
			}
			return configs[key] || defaultValue
		})
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('sanitize', () => {
		it('should sanitize malicious script tags', async () => {
			const input = '<script>alert("xss")</script>Hello World'
			const result = await service.sanitize(input)
			expect(result).toBe('alert("xss")Hello World')
		})

		it('should remove javascript protocols', async () => {
			const input = 'javascript:alert("xss")'
			const result = await service.sanitize(input)
			expect(result).toBe('')
		})

		it('should remove event handlers', async () => {
			const input = 'onclick="alert(1)" onload="evil()"'
			const result = await service.sanitize(input)
			expect(result).toBe('')
		})

		it('should handle null and undefined inputs', async () => {
			expect(await service.sanitize(null)).toBeNull()
			expect(await service.sanitize(undefined)).toBeUndefined()
		})

		it('should sanitize objects recursively', async () => {
			const input = {
				name: '<script>alert("xss")</script>John',
				url: 'javascript:alert("evil")',
				nested: {
					value: 'onclick="bad()"test',
				},
			}

			const result = await service.sanitize(input)
			expect(result.name).toBe('alert("xss")John') // Script tags removed, content preserved
			expect(result.url).toBe('') // Dangerous protocol removed completely
			// Enhanced sanitization removes entire strings containing dangerous patterns for security
			expect(result.nested.value).toBe('')
		})

		it('should sanitize arrays', async () => {
			const input = ['<script>evil</script>good', 'javascript:bad', 'normal']
			const result = await service.sanitize(input)
			expect(result).toEqual(['evilgood', '', 'normal'])
		})

		it('should truncate excessively long strings', async () => {
			const longString = 'a'.repeat(3000)
			const result = await service.sanitize(longString)
			expect(result.length).toBeLessThanOrEqual(2048)
		})
	})

	describe('validateUrl', () => {
		it('should accept valid URLs from allowed domains', () => {
			expect(service.validateUrl('https://example.com/image.jpg')).toBe(true)
			expect(service.validateUrl('http://localhost:3000/test.png')).toBe(true)
		})

		it('should reject URLs from non-allowed domains', () => {
			expect(service.validateUrl('https://malicious.com/image.jpg')).toBe(false)
			expect(service.validateUrl('http://evil.org/test.png')).toBe(false)
		})

		it('should reject non-HTTP protocols', () => {
			expect(service.validateUrl('ftp://example.com/file.jpg')).toBe(false)
			expect(service.validateUrl('javascript:alert(1)')).toBe(false)
			expect(service.validateUrl('data:image/png;base64,abc')).toBe(false)
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

	describe('validateImageDimensions', () => {
		it('should accept valid dimensions', () => {
			expect(service.validateImageDimensions(1920, 1080)).toBe(true)
			expect(service.validateImageDimensions(800, 600)).toBe(true)
		})

		it('should reject dimensions exceeding limits', () => {
			expect(service.validateImageDimensions(10000, 10000)).toBe(false)
			expect(service.validateImageDimensions(8193, 100)).toBe(false)
			expect(service.validateImageDimensions(100, 8193)).toBe(false)
		})

		it('should reject zero or negative dimensions', () => {
			expect(service.validateImageDimensions(0, 100)).toBe(false)
			expect(service.validateImageDimensions(100, 0)).toBe(false)
			expect(service.validateImageDimensions(-100, 100)).toBe(false)
		})

		it('should enforce total pixel limit', () => {
			// 8K limit: 7680 * 4320 = 33,177,600 pixels
			expect(service.validateImageDimensions(7680, 4320)).toBe(true)
			expect(service.validateImageDimensions(8000, 4500)).toBe(false) // Exceeds pixel limit
		})
	})
})
