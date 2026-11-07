/**
 * The hosts an image source names itself (`IMAGE_SOURCES`). They are part of
 * the source, so they are allowed by code rather than by
 * `VALIDATION_ALLOWED_DOMAINS`, and they say nothing about the backend's health,
 * so they stay out of its circuit breaker.
 */
const THIRD_PARTY_IMAGE_HOSTS: readonly string[] = ['i.ytimg.com']

export function isThirdPartyImageHost(hostname: string): boolean {
	return THIRD_PARTY_IMAGE_HOSTS.includes(hostname)
}

export function isThirdPartyImageUrl(url: string | undefined): boolean {
	return url !== undefined && URL.canParse(url) && isThirdPartyImageHost(new URL(url).hostname)
}
