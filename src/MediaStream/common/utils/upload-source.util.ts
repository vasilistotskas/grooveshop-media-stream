/** `…/media/{tenantSchema}/uploads/{path}`: the upstream URL of a tenant upload (`IMAGE_SOURCES.UPLOADED_MEDIA`). */
const UPLOADED_SOURCE_RE = /\/media\/[^/]+\/uploads\/(.+)$/

/**
 * The path of an upload under its tenant's `uploads/` (`blog/a.png`), decoded,
 * from the upstream URL the request was built with; null for any other
 * source (the shared static images) or a path that is not valid percent-encoding.
 */
export function uploadedSourcePath(resourceTarget: string): string | null {
	const match = UPLOADED_SOURCE_RE.exec(resourceTarget)
	if (!match) {
		return null
	}
	try {
		return decodeURIComponent(match[1])
	}
	catch {
		return null
	}
}

/**
 * What kind of image an upload is: the folder the application put it in
 * (`products`, `blog`, `tinymce`), which is what decides the sizes it is shown
 * at. Empty for a file directly under `uploads/`.
 */
export function uploadKind(source: string): string {
	const slash = source.indexOf('/')
	return slash === -1
		? ''
		: source.slice(0, slash)
}
