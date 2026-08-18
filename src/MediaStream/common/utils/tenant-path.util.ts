import { IMAGE } from '#microservice/common/constants/route-prefixes.constant'
import { TENANT_SCHEMA_SEGMENT } from '#microservice/common/constants/tenant.constant'

/**
 * Matches the tenant-scoped media route only: /media_stream-image/media/{tenantSchema}/uploads/...
 * (see IMAGE_SOURCES.UPLOADED_MEDIA in API/config/image-sources.config.ts). The static-image
 * route deliberately does NOT match, so its requests keep the default 'public' tenant schema.
 * Unanchored TENANT_SCHEMA_SEGMENT already rejects anything that isn't a valid schema
 * identifier, so an invalid/malformed segment falls through to 'public' too — no separate
 * validation needed here.
 */
const TENANT_MEDIA_PATH_RE = new RegExp(`^/${IMAGE}/media/(${TENANT_SCHEMA_SEGMENT})/uploads/`)

/**
 * Extract the tenantSchema from a raw (unnormalized) request pathname.
 * Only the tenant-scoped media route carries a schema; every other route
 * (static images, health, metrics, admin, ...) is 'public'.
 *
 * Single source of truth shared by MetricsMiddleware (tenant_schema label)
 * and RateLimit (per-tenant image-processing bucket key).
 */
export function extractTenantSchemaFromPath(pathname: string): string {
	const match = TENANT_MEDIA_PATH_RE.exec(pathname)
	return match ? match[1] : 'public'
}
