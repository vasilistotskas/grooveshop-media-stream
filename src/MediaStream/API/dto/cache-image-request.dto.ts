interface RGBA {
	r?: number
	g?: number
	b?: number
	alpha?: number
}

type Color = string | RGBA

export enum SupportedResizeFormats {
	webp = 'webp',
	jpeg = 'jpeg',
	png = 'png',
	gif = 'gif',
	tiff = 'tiff',
	svg = 'svg',
	avif = 'avif',
}

export enum PositionOptions {
	centre = 'centre',
	center = 'center',
	left = 'left',
	right = 'right',
	top = 'top',
	bottom = 'bottom',
	west = 'west',
	east = 'east',
	north = 'north',
	south = 'south',
	northwest = 'northwest',
	northeast = 'northeast',
	southwest = 'southwest',
	southeast = 'southeast',
	entropy = 'entropy',
	attention = 'attention',
}

export enum BackgroundOptions {
	white = '#FFFFFF',
	black = '#000000',
	transparent = 'transparent',
}

export enum FitOptions {
	contain = 'contain',
	cover = 'cover',
	fill = 'fill',
	inside = 'inside',
	outside = 'outside',
}

/**
 * Resize option defaults. The route makes every segment mandatory, so on the
 * request path these only apply to the default-image fallback and to
 * programmatic callers (cache warming, specs).
 */
export const RESIZE_DEFAULTS = Object.freeze({
	fit: FitOptions.contain,
	position: PositionOptions.entropy,
	format: SupportedResizeFormats.webp,
	background: BackgroundOptions.white,
	trimThreshold: 5,
	quality: 80,
})

// Accepted background formats (arbitrary CSS values such as url(...) are rejected):
//   transparent
//   #RGB   (3 hex digits)
//   #RRGGBB  (6 hex digits)
//   #RRGGBBAA  (8 hex digits, with alpha)
// Anything else silently falls back to white (opaque), matching the existing
// default-to-white behaviour in the ResizeOptions constructor.
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function parseColor(color: string): RGBA {
	if (color === 'transparent') {
		return { r: 0, g: 0, b: 0, alpha: 0 }
	}
	if (!HEX_COLOR_RE.test(color)) {
		// Reject non-hex values (e.g. url(...), red, inherit) — fall back to white
		return { r: 255, g: 255, b: 255, alpha: 1 }
	}
	let hex = color.slice(1) // strip '#'
	if (hex.length === 3) {
		hex = hex
			.split('')
			.map(char => char + char)
			.join('')
	}
	const num = Number.parseInt(hex.slice(0, 6), 16)
	const alpha = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1
	return {
		r: num >> 16,
		g: (num >> 8) & 255,
		b: num & 255,
		alpha,
	}
}

export class ResizeOptions {
	width: number | null = null
	height: number | null = null
	fit: FitOptions = RESIZE_DEFAULTS.fit
	position: PositionOptions | string = RESIZE_DEFAULTS.position
	format: SupportedResizeFormats = RESIZE_DEFAULTS.format
	background: Color = RESIZE_DEFAULTS.background
	trimThreshold: null | number = null
	quality: number = RESIZE_DEFAULTS.quality

	// Field order above is part of the cache identity: GenerateResourceIdentityFromRequestJob
	// hashes JSON.stringify(request), so reordering fields re-keys every cached entry.
	constructor(data: Partial<ResizeOptions> = {}) {
		const { width, height, trimThreshold, background, fit, position, format, quality } = data
		this.width = width ?? null
		this.height = height ?? null
		this.trimThreshold = trimThreshold ? Number(trimThreshold) : null
		this.background = background ? parseColor(String(background)) : RESIZE_DEFAULTS.background
		this.fit = fit ?? RESIZE_DEFAULTS.fit
		this.position = position ?? RESIZE_DEFAULTS.position
		this.format = format ?? RESIZE_DEFAULTS.format
		this.quality = quality !== undefined ? Number(quality) : RESIZE_DEFAULTS.quality
	}
}

export default class CacheImageRequest {
	resourceTarget: string = ''
	resizeOptions: ResizeOptions = new ResizeOptions()
	/**
	 * Tenant schema the image belongs to. Used as part of the cache
	 * namespace so Redis keys are tenant-prefixed (`image:{schema}:{id}`),
	 * which enables per-tenant cache invalidation and avoids cross-tenant
	 * collisions on shared routes (e.g. static images) where the tenant is
	 * not part of the URL. Defaults to "public" for shared static images.
	 */
	tenantSchema: string = 'public'

	constructor(data?: Partial<CacheImageRequest>) {
		Object.assign(this, data)
	}
}
