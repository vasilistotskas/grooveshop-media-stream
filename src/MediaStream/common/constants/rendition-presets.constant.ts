/**
 * The finite set of renditions the service produces.
 *
 * A request names any width, height and quality the validator accepts, but
 * the service stores and encodes only the preset it snaps to
 * (`common/utils/rendition.util.ts`), before the request is hashed into its
 * cache identity. Every URL a client has ever been given keeps working: it is
 * answered with the nearest preset at or above what it asked for, so a
 * rendition is never smaller than requested. Widening or narrowing a ladder
 * re-keys the renditions it changes and needs no `PROCESSING_VERSION` bump.
 */

/** Narrowest and widest rendition, in pixels. */
const MIN_RENDITION_WIDTH = 64
const WIDEST_RENDITION_WIDTH = 2048

/** Each step is the previous one times this, rounded to {@link RENDITION_WIDTH_GRAIN}. */
const RENDITION_WIDTH_STEP = 1.125

/** Widths are multiples of this many pixels (the last step, the cap, is exact). */
const RENDITION_WIDTH_GRAIN = 16

function buildWidthLadder(): number[] {
	const widths = [MIN_RENDITION_WIDTH]
	while (widths[widths.length - 1] < WIDEST_RENDITION_WIDTH) {
		const previous = widths[widths.length - 1]
		const next = Math.max(
			previous + RENDITION_WIDTH_GRAIN,
			Math.round(previous * RENDITION_WIDTH_STEP / RENDITION_WIDTH_GRAIN) * RENDITION_WIDTH_GRAIN,
		)
		widths.push(Math.min(next, WIDEST_RENDITION_WIDTH))
	}
	return widths
}

/**
 * Output widths in pixels, ascending: 64, 80, 96, ... 672, 752, 848 ... 2048
 * (29 steps). From 192 px up a step is 11-17 % wide, so rounding a request up
 * costs 10 % more pixels on average (measured on the 2026-10 request logs) and
 * 17 % at worst; below it a step is one grain wide. A source narrower than the
 * preset is never enlarged (the resize box is shrunk to the source), so the
 * preset only ever caps the output.
 */
export const RENDITION_WIDTHS: readonly number[] = Object.freeze(buildWidthLadder())

/**
 * The widest rendition. A request for more, or for the original size (both
 * axes 0), is capped here: the storefront never lays an image out wider than
 * 1440 CSS px (a 2000 px product zoom is the widest request in the 2026-10
 * request logs), and an uncapped original costs a full-resolution decode and
 * encode per source.
 */
export const MAX_RENDITION_WIDTH: number = RENDITION_WIDTHS[RENDITION_WIDTHS.length - 1]

/**
 * The sizes the storefront asks for, as `{width}x{height}` (0 = unconstrained),
 * answered exactly: a size in this set costs no extra pixel. It is the sizes
 * of the 2026-10 request logs (two weeks, three tenants, both designs) that
 * were asked of at least ten different uploads, plus the single-axis widths the
 * storefront itself computes (the 672 and 1440 px content column, 1200 px
 * pages). Everything else is a probe or an author's own width (TinyMCE
 * content), and snaps up to `RENDITION_WIDTHS`.
 *
 * The set is finite, so the work and the disk a client can cause stay bounded
 * and pre-generation stays a finite list. A size the storefront starts to use
 * that is not here still works, rounded up; add it here when it carries real
 * traffic. To refresh it, count the distinct uploads per size in the request
 * log (`log.context:="ImageRequest"`, stats by `log.width`, `log.height`,
 * `count_uniq(log.path)`) and keep the sizes at or above ten.
 */
export const KNOWN_RENDITION_SIZES: ReadonlySet<string> = new Set([
	'1200x630',
	'672x340',
	'1124x1310',
	'382x445',
	'520x342',
	'672x336',
	'704x820',
	'264x264',
	'472x311',
	'1000x1000',
	'1360x1360',
	'1090x1270',
	'480x315',
	'1040x684',
	'960x630',
	'720x472',
	'360x236',
	'352x410',
	'512x436',
	'132x132',
	'506x430',
	'128x128',
	'704x938',
	'764x890',
	'64x64',
	'320x272',
	'320x240',
	'680x680',
	'640x480',
	'704x528',
	'272x272',
	'2000x2000',
	'160x120',
	'545x635',
	'200x200',
	'768x576',
	'120x120',
	'768x960',
	'352x469',
	'192x192',
	'562x655',
	'112x112',
	'384x288',
	'400x300',
	'800x600',
	'253x215',
	'844x634',
	'672x0',
	'1200x0',
	'1440x0',
])

/**
 * The qualities the storefront asks of the lossy formats other than AVIF (AVIF
 * has its own ceiling, `processing.avifMaxQuality`), answered exactly. Any other
 * value rounds up to the next one, so the output is never worse than asked.
 */
export const RENDITION_QUALITIES: readonly number[] = Object.freeze([75, 80, 85, 90, 100])
