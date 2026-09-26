/**
 * PostgreSQL schema-identifier rules: lowercase letter or underscore at the
 * start, followed by up to 62 lowercase alphanumeric/underscore characters.
 *
 * Single source of truth for validating the ``tenantSchema`` route/query
 * param before it drives the cache namespace, storage path or rate-limit
 * bucket. It bounds the syntax, not the set: any matching string reaches
 * the route, which is why the schema is never a Prometheus label.
 * ``TENANT_SCHEMA_SEGMENT`` is the unanchored character class, for
 * embedding inside larger route-matching regexes (e.g. the rate limiter's
 * tenant-path detector).
 */
export const TENANT_SCHEMA_SEGMENT = '[a-z_][a-z0-9_]{0,62}'

export const TENANT_SCHEMA_PATTERN = new RegExp(`^${TENANT_SCHEMA_SEGMENT}$`)

/** Tenant used for shared routes (static images) and for anything without a tenant segment. */
export const PUBLIC_TENANT_SCHEMA = 'public'
