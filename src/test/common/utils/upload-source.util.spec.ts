import { describe, expect, it } from 'vitest'
import { uploadedSourcePath, uploadKind } from '#microservice/common/utils/upload-source.util'

describe('uploadedSourcePath', () => {
	it('returns the path under the tenant uploads, decoded', () => {
		expect(uploadedSourcePath('http://static-svc/media/acme/uploads/blog%2Fa%20b.png')).toBe('blog/a b.png')
		expect(uploadedSourcePath('http://static-svc/media/acme/uploads/%CE%B1.png')).toBe('α.png')
	})

	it('is null for the shared static images', () => {
		expect(uploadedSourcePath('http://static-svc/static/images/logo.png')).toBeNull()
	})

	it('is null for a path that is not valid percent-encoding', () => {
		expect(uploadedSourcePath('http://static-svc/media/acme/uploads/%E0%A4%A.png')).toBeNull()
	})
})

describe('uploadKind', () => {
	it('is the folder the upload sits in', () => {
		expect(uploadKind('products/a.png')).toBe('products')
		expect(uploadKind('blog/2026/a.png')).toBe('blog')
	})

	it('is empty for a file directly under uploads', () => {
		expect(uploadKind('a.png')).toBe('')
	})
})
