---
title: Renditions - presets, the shared store and pre-generation
description: How the media stream bounds the renditions it makes, keeps them on a volume every replica shares, and renders an upload's renditions before anyone asks. Why, how it behaves, how to configure and watch it.
---

# Renditions: presets, the shared store and pre-generation

A **rendition** is one processed image: a source, a size, a crop, a format
and a quality. Every rendition is made on its first request and kept. Three
mechanisms keep the cost of making them off the visitor's request.

The code wins over this page. Source files:

| File | What it does |
|---|---|
| `src/MediaStream/common/constants/rendition-presets.constant.ts` | The width ladder, the width cap, the quality ladder |
| `src/MediaStream/common/utils/rendition.util.ts` | `toRendition`: the preset a request is answered with |
| `src/MediaStream/API/controllers/media-stream-image.controller.ts` | Applies it in `buildResizeOptions`, before the request is hashed |
| `src/MediaStream/Renditions/services/rendition-generator.service.ts` | The pre-generation cron |
| `src/MediaStream/Renditions/services/rendition-source-scanner.service.ts` | Lists the uploads on the media volume |
| `src/MediaStream/Renditions/utils/rendition-catalogue.util.ts` | Learns which renditions a folder is shown at |
| `src/MediaStream/Processing/services/processing-admission.service.ts` | `runAsBackground`: pre-generation yields to requests |

## Why

Measured on the production request log (VictoriaLogs, 14 days to
2026-11-01, 13.8 thousand image requests, three tenants):

- 12.7 thousand of them were cache misses. The same rendition missed again
  after every deploy: the disk tier was an `emptyDir`, the Redis tier is
  evicted (the Redis instance is full by design, see
  `grooveshop-infrastructure/docs/redis.md`: media-stream's database held
  6.5 MiB), and the memory tier is per pod.
- A miss costs an encode (AVIF: 1.0 s p50 and 2.4 s p95 on the production
  cores, queue wait excluded; the 2026-10-16 profile) behind a queue of 16 on
  one pipeline per pod. A burst of first-time
  requests (a Lighthouse run, a new store, a new layout) overflows it: 190
  of 210 in the local reproduction below, 153 `503` in 3 minutes on
  2026-10-19.
- 240 distinct size combinations, 165 distinct widths and 28 aspect ratios
  were requested. About 95 of the combinations were `0 x 0` or one-axis
  requests from TinyMCE content, whose HTML stores the URL, so a storefront
  release cannot change them.

## 1. Presets: what is made is a finite set

`toRendition` maps every request to a preset before it is hashed into its
cache identity (the hash is the cache key, the Redis key and the file name):

| Parameter | Preset |
|---|---|
| width | The next step of `RENDITION_WIDTHS` at or above it (29 steps, 64 to 2048 px; 11-17 % apart from 192 px up) |
| height, both axes set | Follows the snapped width at the requested aspect ratio (a `cover` crop keeps its shape) |
| height, one axis set | Only that axis, snapped; the other stays 0 |
| both axes 0 (original size), or wider than 2048 | The 2048 cap |
| quality, AVIF | `min(requested, PROCESSING_AVIF_MAX_QUALITY)` |
| quality, WebP / JPEG / PNG | The next step of `RENDITION_QUALITIES` (60, 80, 90, 100) |
| quality, GIF / TIFF | 100 (ignored by the encoder) |
| position | `centre` is `center`; the fits that ignore it (`inside`, `outside`, `fill`) share `center` |

Properties that matter:

- **No URL is refused for its size.** Every stored URL (TinyMCE content,
  feeds, sitemaps, emails) keeps working and is answered with the nearest
  preset at or above what it asked for. Nothing needs a storefront release
  first.
- **A rendition is never smaller than requested** (except past the cap), and
  a source narrower than the preset is never enlarged.
- **A preset maps to itself.** Pre-generated renditions and live requests
  share one cache identity.
- `fit`, `background` and `trimThreshold` are not snapped. A request with an
  aspect ratio the snap would push outside the pixel budget (1 x 8000) is
  kept as asked.

Replayed over the 14-day log this is **+10 % pixels** and **-4 % distinct
renditions** (4945 to 4756 over 911 sources): the storefront already asks
each source for few sizes, so the ladder is not what raises the hit ratio.
It bounds the work and the disk a client that enumerates widths can cause,
which is what a durable store needs, and it is what makes a pre-generation
list finite. Changing a ladder re-keys the renditions it changes and needs no
`PROCESSING_VERSION` bump.

## 2. The shared store

The on-disk tier (`CACHE_FILE_DIRECTORY`, the `.rsc`/`.rsm` pairs) is a
volume mounted by **every replica** (`ReadWriteMany`), so it survives a
restart or a deploy and a rendition made by one pod is served by the other.
Memory and Redis stay in front of it as before, and are refilled from it.

What the sharing required, and what it did not:

- Every write was already atomic (a temp file per request, then `rename`).
  `AccessCountTracker` named its temp sidecar `{id}.rsm.tmp` for every pod; it
  is now per process, because `pid` is 1 in every container.
- The nightly cleanup runs on every replica over the same directory. Each
  ranks the same inventory the same way, so they remove the same pairs, and
  `unlink` ignores `ENOENT`.
- A tenant flush clears each replica's tiers bottom-up as before. The disk
  sweep is idempotent on the shared directory, and each replica advances its
  own flush epoch before it clears, so the fencing of in-flight writes is
  unchanged.
- The disk thresholds (`STORAGE_WARNING_*`, `STORAGE_CRITICAL_*`) describe
  the volume now and are set in the deployment, not left at the 800 MiB
  defaults that suited an `emptyDir`.
- Two replicas folding hits into one sidecar can lose a count. The count only
  ranks entries for eviction and warming, so this is accepted.

## 3. Pre-generation

`RenditionGeneratorService` renders the renditions of an upload before
anyone asks, so the encode cost follows uploads, not traffic.

It is **level-triggered**: every `RENDITIONS_CRON` tick it compares what the
application has stored with what the cache holds. There is no event to lose
and no job queue (the service has none by design, and a restart loses
nothing: the state is the volume).

1. **Learn the catalogue.** Every sidecar records the upload
   (`source`, `blog/a.png`) and the resize options it was made with. A
   rendition that exists for at least `RENDITIONS_MIN_SOURCES` different
   sources of a folder (`products`, `blog`, `tinymce`) is one the storefront
   shows that folder at; the most shared come first, at most
   `RENDITIONS_MAX_PER_SOURCE` per folder. Nothing is hard-coded, so a
   storefront that asks for new sizes is followed, and a new design is
   learned from its first few uploads.
2. **Find the uploads that lack them.** The Django backend's media volume is
   mounted read-only at `RENDITIONS_MEDIA_DIRECTORY`
   (`{dir}/{tenant}/uploads/**`). An upload is done when the last
   rendition of its folder's catalogue is stored, which is one `stat`. Newest
   uploads first, so a new upload is ready before the backlog. Suspended
   stores are skipped. Existing images are backfilled by the same pass.
3. **Render them as background work.** `runAsBackground` admits a pipeline
   only when no request holds or awaits a slot (a `BackgroundYieldError`
   otherwise, which counts as no shed and no error), so a request is delayed
   by at most the encode already running. A Redis lock per upload keeps the
   replicas off the same one. A cycle ends after five minutes and the next
   tick rescans.
4. **Leave what cannot be rendered alone** (source missing, too large, not
   an image) for six hours, in memory, so a bad upload is not retried every
   cycle.

The pre-generated rendition is produced by the same `execute()` as a live
request, so it is byte-identical to what the request would have produced and
is served with the same headers.

## Overload

Admission control is unchanged: a request that **needs an encode** beyond
the queue is still answered 503 with `Retry-After` (`ProcessingOverloadedError`).
What changes is how often that is a visitor's request:

- a stored rendition is served from memory, Redis or the shared volume and
  never reaches admission, whatever else is queued;
- the renditions a folder is shown at are stored when its upload is, so a
  visitor of a new page finds them;
- what is left is a rendition nobody learned yet (a new size, a new
  design), the first time.

There is no "serve the nearest rendition or the original instead of a 503".
That was the plan's fourth point and is not built: the original can be
several MB, an SVG original must not be served unsanitised, and an edge
that caches a stand-in under the real URL would pin it for the TTL. It can be
added behind the same admission error if the remaining 503 rate asks for it.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `RENDITIONS_MEDIA_DIRECTORY` | empty (off) | Root of the tenants' uploads: `{dir}/{tenant}/uploads/` |
| `RENDITIONS_CRON` | `*/10 * * * *` | How often the pass runs (a six-field cron with seconds works) |
| `RENDITIONS_MIN_SOURCES` | 3 | Sources of a folder that must share a rendition before it is pre-generated |
| `RENDITIONS_MAX_PER_SOURCE` | 16 | Renditions pre-generated per upload |

Plus `CACHE_FILE_DIRECTORY` on the shared volume and the `STORAGE_*`
thresholds sized for it.

## Watching it

| Signal | Meaning |
|---|---|
| `mediastream_rendition_backlog_sources` | Uploads still missing renditions after the last pass; it should reach 0 and stay there |
| `mediastream_rendition_pregeneration_total{result}` | `generated`, `present` (already stored), `yielded` (a request had the slot), `failed` |
| `mediastream_processing_rejected_total{reason}` | Requests shed by admission; background yields are not in it |
| `log.cache` on the image request log | `miss` should be rare on a page whose uploads are old enough |

Verifying a rollout: upload an image to a folder with history, wait one
cycle, request one of the folder's renditions. It must be `disk` (or
`memory`), not `miss`.

## Local reproduction

One CPU, queue 16, 10 s wait (production's admission), 6 existing blog
images asked at the 7 renditions the storefront uses for a blog cover
(history), then 30 new uploads, then every rendition of every new upload
requested at once with 40 in flight:

| | Responses | p95 |
|---|---|---|
| Without pre-generation | 20 x 200, **190 x 503** | 1.8 s |
| With pre-generation (210 renditions made in 75 s while serving) | **210 x 200** | 67 ms |

During that pre-generation, requests for stored renditions kept a 3 ms p95
(max 19 ms), and requests for renditions nobody had made were all served,
p95 347 ms (their own encode plus at most the background encode in flight).
