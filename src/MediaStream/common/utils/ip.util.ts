/**
 * Shared client-IP helpers used by guards that gate on internal callers.
 */

/**
 * Express `trust proxy` hop count (main.ts). Public traffic arrives
 * Cloudflare → Traefik → here, and Traefik trusts X-Forwarded-For from
 * Cloudflare's ranges only (grooveshop-infrastructure,
 * docs/edge-trust-boundary.md), so the header this service sees is:
 *
 * - via Cloudflare: `<visitor>, <cloudflare edge>` — Cloudflare appends the
 *   visitor, Traefik appends its peer. A visitor's own entries sit further
 *   left and are never reached.
 * - direct to a node: `<caller>` — Traefik deletes the caller's header and
 *   appends the caller.
 *
 * Two hops (the socket peer = Traefik, then the rightmost entry) make
 * `req.ip` the visitor in the first case and the caller in the second,
 * because Express returns the leftmost address when the chain is shorter
 * than the count. In-cluster callers send no header and stay the socket
 * address.
 */
export const TRUSTED_PROXY_HOPS = 2

/**
 * Extract the client IP from an Express request.
 * `req.ip` is the client as resolved by `trust proxy = TRUSTED_PROXY_HOPS`.
 * Falls back to socket address — never trusts raw XFF headers directly.
 */
export function getClientIp(request: {
	ip?: string
	socket?: { remoteAddress?: string }
	connection?: { remoteAddress?: string }
}): string {
	return (
		request.ip
		|| request.socket?.remoteAddress
		|| request.connection?.remoteAddress
		|| 'unknown'
	)
}

/**
 * Returns true only when the IP is a loopback or private-range address
 * (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16). Used to restrict
 * header-based bypasses to callers that cannot be spoofed from the
 * public internet.
 */
export function isInternalIp(ip: string): boolean {
	// IPv4 loopback
	if (ip === '127.0.0.1')
		return true

	// IPv6 loopback
	if (ip === '::1' || ip === '::ffff:127.0.0.1')
		return true

	// Strip IPv4-mapped IPv6 prefix so the checks below work uniformly
	const bare = ip.startsWith('::ffff:') ? ip.slice(7) : ip

	const parts = bare.split('.').map(Number)
	if (parts.length !== 4 || parts.some(n => Number.isNaN(n))) {
		// Not a dotted-decimal IPv4 address — treat as external
		return false
	}

	const [a, b] = parts

	// 10.0.0.0/8
	if (a === 10)
		return true

	// 172.16.0.0/12
	if (a === 172 && b >= 16 && b <= 31)
		return true

	// 192.168.0.0/16
	if (a === 192 && b === 168)
		return true

	return false
}
