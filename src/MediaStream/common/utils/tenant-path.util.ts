import { IMAGE } from '#microservice/common/constants/route-prefixes.constant'
import { PUBLIC_TENANT_SCHEMA, TENANT_SCHEMA_SEGMENT } from '#microservice/common/constants/tenant.constant'
import { decodePathFully } from '#microservice/common/utils/percent-decode.util'

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
 * Extract the tenantSchema from a request pathname.
 * Only the tenant-scoped media route carries a schema; every other route
 * (static images, health, metrics, admin, ...) is 'public'.
 *
 * Decodes first, because the CONTROLLER decodes: `/media/%77ebside/...`
 * and `/media/webside/...` are the same image to it (verified — both
 * return identical bytes and cache under image:webside), but this
 * matcher saw the raw form and reported 'public'. That split the
 * per-tenant rate-limit bucket introduced in 21a810d: alternating
 * spellings bought a second full quota per IP, and the encoded half
 * landed in the shared 'public' bucket that static images use, so one
 * tenant's burst could throttle static assets for everyone on that IP.
 * The tenant_schema metric under-reported the same traffic.
 *
 * Single source of truth shared by MetricsMiddleware (tenant_schema label)
 * and RateLimit (per-tenant image-processing bucket key).
 */
export function extractTenantSchemaFromPath(pathname: string): string {
	let path: string
	try {
		path = decodePathFully(pathname)
	}
	catch {
		// Malformed encoding: the controller rejects it, and an unmatched path
		// is 'public' either way.
		return PUBLIC_TENANT_SCHEMA
	}
	const match = TENANT_MEDIA_PATH_RE.exec(path)
	return match ? match[1] : PUBLIC_TENANT_SCHEMA
}
