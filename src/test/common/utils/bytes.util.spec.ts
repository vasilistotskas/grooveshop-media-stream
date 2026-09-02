import { describe, expect, it } from 'vitest'
import { bytesToMb, formatBytes } from '#microservice/common/utils/bytes.util'

describe('bytes.util', () => {
	it('formats with the largest fitting unit and one decimal', () => {
		expect(formatBytes(0)).toBe('0.0 B')
		expect(formatBytes(512)).toBe('512.0 B')
		expect(formatBytes(1024)).toBe('1.0 KB')
		expect(formatBytes(1536 * 1024)).toBe('1.5 MB')
		expect(formatBytes(3 * 1024 ** 3)).toBe('3.0 GB')
	})

	it('caps at GB', () => {
		expect(formatBytes(2048 * 1024 ** 3)).toBe('2048.0 GB')
	})

	it('converts to whole megabytes', () => {
		expect(bytesToMb(0)).toBe(0)
		expect(bytesToMb(1024 * 1024)).toBe(1)
		expect(bytesToMb(1.6 * 1024 * 1024)).toBe(2)
	})
})
