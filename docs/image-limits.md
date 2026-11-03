# Source image limits

What this service accepts as a **source** image, and how the API that stores
the uploads learns it. The code wins over this page.

Source: `src/MediaStream/common/constants/image-limits.constant.ts`,
`src/MediaStream/Cache/operations/resource-fetcher.service.ts`,
`src/MediaStream/Validation/services/resource-validation.service.ts`,
`contract/image-limits.json`,
`src/test/common/constants/image-limits-contract.spec.ts`.

## What is refused

A source is fetched to a temp file; its real format is sniffed from the first
kilobyte (never from the URL extension) and then that format's size cap applies,
to the declared `Content-Length` and again to every byte streamed:

| Format | Cap |
|---|---|
| JPEG | 5 MiB |
| PNG | 8 MiB |
| WebP | 3 MiB |
| GIF | 2 MiB |
| TIFF | 10 MiB |
| AVIF | 10 MiB |
| SVG | 1 MiB |

Every input is also held to sharp's `limitInputPixels` (`SHARP_INPUT_PIXEL_LIMIT`,
16383 x 16383), which rejects a decompression bomb before a pixel is decoded.

The 7680 x 4320 total-pixel budget is NOT a source limit: it bounds the
REQUESTED output size (`RequestValidatorService`). A refused source is served as
the default image, so an upload the service cannot render shows a placeholder.

## The contract

`contract/image-limits.json` publishes the byte caps and the pixel limit.
grooveshop-django-api copies it, pinned by git id, to `core/data/image-limits.json`
and validates every image upload against it (`core/uploads.py`), so an upload that
would render as a placeholder is refused when it is made. The copy is refreshed by
that repository's sync script; a weekly workflow there fails when this file has
moved on.

`image-limits-contract.spec.ts` holds the file equal to the constants. To change a
limit: change the constant and the file together, ship this service, then refresh
the API's copy.
