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
		if (color[0] === '#') {
			color = color.slice(1)
		}
		if (color.length === 3) {
			color = color
				.split('')
				.map(char => char + char)
				.join('')
		}
		const num = Number.parseInt(color, 16)
		return {
			r: num >> 16,
			g: (num >> 8) & 255,
			b: num & 255,
			alpha: 1,
		}
	}
	return color as RGBA
}

export class ResizeOptions {
	width: number | null = null as any
	height: number | null = null as any
	fit = FitOptions.contain
	position: PositionOptions | string = PositionOptions.entropy
	format = SupportedResizeFormats.webp
	background: Color = BackgroundOptions.white
	trimThreshold: null | number = null as any
	quality = 100

	constructor(data?: Partial<ResizeOptions>) {
		const { width, height, trimThreshold, background, fit, position, format, quality, ...rest } = data || {}
		this.width = width ?? null
		this.height = height ?? null
		this.trimThreshold = trimThreshold ? Number(trimThreshold) : null
		this.background = background ? parseColor(String(background)) : BackgroundOptions.white
		this.fit = fit ?? FitOptions.contain
		this.position = position ?? PositionOptions.entropy
		this.format = format ?? SupportedResizeFormats.webp
		this.quality = quality !== undefined ? Number(quality) : 100

		Object.assign(this, rest);

		['width', 'height'].forEach((sizeOption: string) => {
			if (data && data[sizeOption] === null) {
				delete this[sizeOption]
			}
		})
	}
}

export default class CacheImageRequest {
	resourceTarget: string
	ttl?: number
	resizeOptions: ResizeOptions

	constructor(data?: Partial<CacheImageRequest>) {
		Object.assign(this, data)
	}
}
