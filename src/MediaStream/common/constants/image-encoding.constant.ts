/**
 * Raster encoding and resampling tunables.
 *
 * Changing anything here changes the bytes served for an unchanged URL, so
 * bump `PROCESSING_VERSION` with it: the version is part of the cache identity
 * (`GenerateResourceIdentityFromRequestJob`), which makes the new output a
 * cache miss instead of leaving the previous encoding cached for the TTL.
 */

/**
 * Cache-identity version of the processing pipeline's output. Increment on
 * every change that alters the produced bytes (encoder options, resampling,
 * sharpening). The AVIF quality ceiling (`processing.avifMaxQuality`) needs no
 * bump: the controller clamps the request before it is hashed.
 */
export const PROCESSING_VERSION = 3

/**
 * AVIF CPU effort (0 fastest, 9 slowest). Measured on 2400 px product photos:
 * effort 4 costs 4-8x the encode time of effort 3 for 2-3 % smaller files, so
 * 3 is the cache-miss cost/size sweet spot.
 */
export const AVIF_EFFORT = 3

/** Photos keep full-resolution chroma; 4:2:0 smears coloured edges on products. */
export const AVIF_CHROMA_SUBSAMPLING = '4:4:4'

/** Sharpen only when the source is reduced by more than this factor. */
export const SHARPEN_MIN_DOWNSCALE_FACTOR = 2

/** Gaussian sigma of the post-downscale sharpen (a light touch, no halos). */
export const SHARPEN_SIGMA = 0.5
