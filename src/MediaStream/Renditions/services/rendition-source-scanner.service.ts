import type { Dirent } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { extname, join, posix } from 'node:path'
import { Injectable } from '@nestjs/common'
import { TENANT_SCHEMA_PATTERN } from '#microservice/common/constants/tenant.constant'
import { errorMessage } from '#microservice/common/utils/error-message.util'
import { CorrelatedLogger } from '#microservice/Correlation/utils/logger.util'

/** An image in a tenant's uploads. */
export interface UploadedSource {
	tenantSchema: string
	/** Path under the tenant's `uploads/`, `/`-separated (`blog/a.png`). */
	source: string
}

/**
 * Extensions of the raster sources the pipeline decodes. SVG is left out: its
 * renditions are rasterised icons asked for individually, never a size ladder.
 */
const RASTER_EXTENSIONS = new Set([
	'.jpg',
	'.jpeg',
	'.png',
	'.webp',
	'.gif',
	'.tif',
	'.tiff',
	'.avif',
])

/**
 * Lists the images the application has stored: `{root}/{tenantSchema}/uploads/**`
 * on the volume the Django backend writes its media to, mounted read-only.
 * Nothing is trusted from a name: a tenant directory must be a valid schema
 * identifier, and a source is only ever read back through the upstream URL.
 */
@Injectable()
export class RenditionSourceScanner {
	async scan(root: string): Promise<UploadedSource[]> {
		const sources: UploadedSource[] = []
		for (const tenant of await this.list(root)) {
			if (!tenant.isDirectory() || !TENANT_SCHEMA_PATTERN.test(tenant.name)) {
				continue
			}
			for (const source of await this.walk(join(root, tenant.name, 'uploads'), '')) {
				sources.push({ tenantSchema: tenant.name, source })
			}
		}
		return sources
	}

	/** Last modification of an upload, epoch milliseconds; 0 when it vanished. */
	async modifiedAt(root: string, { tenantSchema, source }: UploadedSource): Promise<number> {
		try {
			return (await stat(join(root, tenantSchema, 'uploads', source))).mtimeMs
		}
		catch {
			return 0
		}
	}

	private async walk(directory: string, prefix: string): Promise<string[]> {
		const found: string[] = []
		for (const entry of await this.list(directory)) {
			const relative = posix.join(prefix, entry.name)
			if (entry.isDirectory()) {
				found.push(...await this.walk(join(directory, entry.name), relative))
			}
			else if (entry.isFile() && RASTER_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
				found.push(relative)
			}
		}
		return found
	}

	/** An unreadable or missing directory has nothing to list; one tenant without uploads must not stop the scan. */
	private async list(directory: string): Promise<Dirent[]> {
		try {
			return await readdir(directory, { withFileTypes: true })
		}
		catch (error: unknown) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
				CorrelatedLogger.warn(`Cannot list ${directory}: ${errorMessage(error)}`, RenditionSourceScanner.name)
			}
			return []
		}
	}
}
