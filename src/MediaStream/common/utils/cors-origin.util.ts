import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface'

export type CorsOrigin = NonNullable<CorsOptions['origin']>
export type HostnamePredicate = (hostname: string) => boolean

/**
 * Parse an `Origin`-style value (`scheme://host[:port]`) into its normalised
 * origin, or `undefined` when it is not an http(s) origin at all.
 */
export function parseHttpOrigin(value: string): string | undefined {
	let parsed: URL
	try {
		parsed = new URL(value)
	}
	catch {
		return undefined
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return undefined
	}
	return parsed.origin.toLowerCase()
}

/**
 * Build the `origin` option for `app.enableCors()`.
 *
 * `CORS_ORIGIN` names the PLATFORM's own origins only — its storefront and
 * asset hosts, deployment data identical for every store. Store origins are
 * never listed there: a request `Origin` is allowed when its hostname belongs
 * to an active tenant per the Django-fed dynamic allowlist
 * (`TenantDomainsService`), so onboarding a store needs neither an env change
 * nor a restart, and the first store's DNS is not baked into a config value
 * every other store inherits.
 *
 * The result is a per-request predicate: the `cors` middleware answers it by
 * reflecting the request's own `Origin`, one value per response, which is
 * the only shape the header may take. The previous configuration handed the
 * comma-joined list over as a plain string, which `cors` copies verbatim into
 * `Access-Control-Allow-Origin` — a multi-valued header no browser accepts —
 * so no origin, tenant #1's included, ever passed a CORS check.
 *
 * `'*'` (a development convenience; `ConfigService.validate` refuses it in
 * production) short-circuits to the wildcard.
 */
export function buildCorsOrigin(staticOrigins: readonly string[], isTenantHostname: HostnamePredicate): CorsOrigin {
	if (staticOrigins.includes('*')) {
		return '*'
	}

	const allowed = new Set(
		staticOrigins
			.map(parseHttpOrigin)
			.filter((origin): origin is string => origin !== undefined),
	)

	return (requestOrigin, callback) => {
		callback(null, requestOrigin !== undefined && isAllowedOrigin(requestOrigin, allowed, isTenantHostname))
	}
}

function isAllowedOrigin(requestOrigin: string, allowed: ReadonlySet<string>, isTenantHostname: HostnamePredicate): boolean {
	const origin = parseHttpOrigin(requestOrigin)
	if (origin === undefined) {
		return false
	}
	return allowed.has(origin) || isTenantHostname(new URL(origin).hostname)
}
