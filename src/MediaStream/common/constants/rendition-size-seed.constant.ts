/**
 * The sizes a fresh deployment starts with, as `{width}x{height}` (0 =
 * unconstrained): the sizes of the 2026-10 request logs (two weeks, three
 * tenants, both designs) asked of at least ten different uploads, plus the
 * single-axis widths the storefront computes itself (the 672 and 1440 px
 * content column, 1200 px pages).
 *
 * This is a seed, not the source of truth. `RenditionSizeService` writes it
 * into Redis only while the set of exact sizes is empty, so a first deploy
 * answers the storefront's own sizes exactly from its first request; from then
 * on the set is learned from traffic (a size asked of enough uploads becomes
 * exact, one unused for the window leaves), and editing this list changes
 * nothing for a deployment that already has a set.
 *
 * Refreshing it (rarely needed, and only ever for the next empty set): count
 * the distinct uploads per size in the request log, `log.context:="ImageRequest"
 * | stats by (log.width, log.height) count_uniq(log.path)`, and keep the sizes
 * asked of at least ten uploads.
 */
export const SEED_RENDITION_SIZES: readonly string[] = Object.freeze([
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
