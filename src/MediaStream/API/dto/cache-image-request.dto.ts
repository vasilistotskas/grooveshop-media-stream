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

// Accepted background formats (C18 fix — reject arbitrary CSS values like url(...)):
//   transparent
//   #RGB   (3 hex digits)
//   #RRGGBB  (6 hex digits)
//   #RRGGBBAA  (8 hex digits, with alpha)
// Anything else silently falls back to white (opaque), matching the existing
// default-to-white behaviour in the ResizeOptions constructor.
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i

function parseColor(color: string): RGBA {
	if (typeof color === 'string') {
		if (color === 'transparent') {
			return {
				r: 0,
				g: 0,
				b: 0,
				alpha: 0,
			}
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
	return color as RGBA
}

export class ResizeOptions {
	width: number | null = null
	height: number | null = null
	fit = FitOptions.contain
	position: PositionOptions | string = PositionOptions.entropy
	format = SupportedResizeFormats.webp
	background: Color = BackgroundOptions.white
	trimThreshold: null | number = null
	quality = 80

	constructor(data?: Partial<ResizeOptions>) {
		const { width, height, trimThreshold, background, fit, position, format, quality, ...rest } = data || {}
		this.width = width ?? null
		this.height = height ?? null
		this.trimThreshold = trimThreshold ? Number(trimThreshold) : null
		this.background = background ? parseColor(String(background)) : BackgroundOptions.white
		this.fit = fit ?? FitOptions.contain
		this.position = position ?? PositionOptions.entropy
		this.format = format ?? SupportedResizeFormats.webp
		this.quality = quality !== undefined ? Number(quality) : 80

		Object.assign(this, rest);

		(['width', 'height'] as const).forEach((sizeOption) => {
			if (data && data[sizeOption] === null) {
				delete (this as any)[sizeOption]
			}
		})
	}
}

export default class CacheImageRequest {
	resourceTarget: string = ''
	ttl?: number
	resizeOptions: ResizeOptions = new ResizeOptions()

	constructor(data?: Partial<CacheImageRequest>) {
		Object.assign(this, data)
	}
}
