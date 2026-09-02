import { PUBLIC_TENANT_SCHEMA } from '#microservice/common/constants/tenant.constant'

const IMAGE_PREFIX = 'image'
const SEPARATOR = ':'

/** SCAN pattern covering every image entry of every tenant. */
export const IMAGE_KEY_PATTERN = `${IMAGE_PREFIX}${SEPARATOR}*`

/**
 * Per-tenant namespace: keys live under `image:{tenantSchema}:…` in every
 * cache layer, which is what makes SCAN-based per-tenant invalidation possible.
 */
export function imageNamespace(tenantSchema?: string | null): string {
	return `${IMAGE_PREFIX}${SEPARATOR}${tenantSchema || PUBLIC_TENANT_SCHEMA}`
}

export function cacheKey(namespace: string, identifier: string): string {
	return `${namespace}${SEPARATOR}${identifier}`
}

/** `image:acme` → `acme`; any other namespace shape → `public`. */
export function tenantFromNamespace(namespace: string): string {
	const [prefix, tenant] = namespace.split(SEPARATOR)
	return prefix === IMAGE_PREFIX && tenant ? tenant : PUBLIC_TENANT_SCHEMA
}

/** `image:acme:uuid` → `image:acme:`; null when the key has fewer than two segments. */
export function keyNamespacePrefix(key: string): string | null {
	const first = key.indexOf(SEPARATOR)
	if (first === -1) {
		return null
	}
	const second = key.indexOf(SEPARATOR, first + 1)
	if (second === -1) {
		return null
	}
	return key.slice(0, second + 1)
}
