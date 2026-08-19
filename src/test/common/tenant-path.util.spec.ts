import { describe, expect, it } from 'vitest'
import { extractTenantSchemaFromPath } from '#microservice/common/utils/tenant-path.util'

describe('extractTenantSchemaFromPath', () => {
	it('reads the schema from a tenant-scoped media path', () => {
		expect(
			extractTenantSchemaFromPath(
				'/media_stream-image/media/acme/uploads/products/a.png/100/100/contain/center/FFFFFF/5/80.webp',
			),
		).toBe('acme')
	})

	it('reports public for routes that carry no schema', () => {
		expect(extractTenantSchemaFromPath('/media_stream-image/static/images/x.png/100/100/contain/center/FFFFFF/5/80.webp')).toBe('public')
		expect(extractTenantSchemaFromPath('/health')).toBe('public')
		expect(extractTenantSchemaFromPath('/metrics')).toBe('public')
	})

	// The controller percent-decodes before matching its route (up to
	// three passes, because TinyMCE-authored URLs arrive double-encoded),
	// so these spellings are all the SAME image to it. This matcher used
	// to read the raw path and report 'public' for the encoded ones,
	// which split the per-tenant rate-limit bucket: alternating spellings
	// bought a second full quota per IP, and the encoded half landed in
	// the shared 'public' bucket that static images use.
	it('resolves the same schema however the segment is encoded', () => {
		const encodings = [
			'/media_stream-image/media/acme/uploads/x.png/1/1/contain/center/FFFFFF/5/80.webp',
			'/media_stream-image/media/%61cme/uploads/x.png/1/1/contain/center/FFFFFF/5/80.webp',
			'/media_stream-image/media/acme/upl%6fads/x.png/1/1/contain/center/FFFFFF/5/80.webp',
			'/media_stream-image/media/%2561cme/uploads/x.png/1/1/contain/center/FFFFFF/5/80.webp',
		]
		for (const path of encodings) {
			expect(extractTenantSchemaFromPath(path)).toBe('acme')
		}
	})

	it('falls back to public on malformed encoding rather than throwing', () => {
		expect(
			extractTenantSchemaFromPath('/media_stream-image/media/%E0%A4%A/uploads/x.png/1/1/contain/center/FFFFFF/5/80.webp'),
		).toBe('public')
	})

	it('rejects a segment that is not a valid schema identifier', () => {
		expect(
			extractTenantSchemaFromPath('/media_stream-image/media/Not-A-Schema/uploads/x.png/1/1/contain/center/FFFFFF/5/80.webp'),
		).toBe('public')
	})
})
