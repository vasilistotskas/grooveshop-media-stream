import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RenditionSourceScanner } from '#microservice/Renditions/services/rendition-source-scanner.service'

describe('renditionSourceScanner', () => {
	let root: string
	const scanner = new RenditionSourceScanner()

	async function file(path: string): Promise<void> {
		await mkdir(dirname(join(root, path)), { recursive: true })
		await writeFile(join(root, path), 'x')
	}

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'renditions-scan-'))
	})

	afterEach(async () => {
		await rm(root, { recursive: true, force: true })
	})

	it('lists the raster images under every tenant uploads, nested folders included', async () => {
		await file('acme/uploads/blog/a.png')
		await file('acme/uploads/blog/2026/b.JPG')
		await file('acme/uploads/products/c.webp')
		await file('globex/uploads/d.avif')

		const sources = await scanner.scan(root)

		expect(sources).toEqual(expect.arrayContaining([
			{ tenantSchema: 'acme', source: 'blog/a.png' },
			{ tenantSchema: 'acme', source: 'blog/2026/b.JPG' },
			{ tenantSchema: 'acme', source: 'products/c.webp' },
			{ tenantSchema: 'globex', source: 'd.avif' },
		]))
		expect(sources).toHaveLength(4)
	})

	it('leaves out vectors, documents and anything outside uploads', async () => {
		await file('acme/uploads/blog/icon.svg')
		await file('acme/uploads/files/manual.pdf')
		await file('acme/private/a.png')
		await file('stray.png')

		expect(await scanner.scan(root)).toEqual([])
	})

	it('reads only directories that are valid schema identifiers', async () => {
		await file('Not-A-Schema/uploads/a.png')
		await file('UPPER/uploads/a.png')

		expect(await scanner.scan(root)).toEqual([])
	})

	it('skips a tenant without an uploads directory and a root that does not exist', async () => {
		await mkdir(join(root, 'acme'))
		await file('globex/uploads/a.png')

		expect(await scanner.scan(root)).toEqual([
			{ tenantSchema: 'globex', source: 'a.png' },
		])
		expect(await scanner.scan(join(root, 'missing'))).toEqual([])
	})

	it('reports when an upload was last modified, and 0 when it is gone', async () => {
		await file('acme/uploads/a.png')
		await utimes(join(root, 'acme/uploads/a.png'), new Date(1_700_000_000_000), new Date(1_700_000_000_000))

		expect(await scanner.modifiedAt(root, { tenantSchema: 'acme', source: 'a.png' })).toBe(1_700_000_000_000)
		expect(await scanner.modifiedAt(root, { tenantSchema: 'acme', source: 'gone.png' })).toBe(0)
	})
})
