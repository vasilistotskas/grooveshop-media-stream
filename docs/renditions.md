---
title: Renditions - presets, the rendition store and pre-generation
description: How the media stream bounds the renditions it makes, keeps them in a bucket every replica shares, and renders an upload's renditions before anyone asks. Why, how it behaves, how to configure and watch it.
---

# Renditions: presets, the rendition store and pre-generation

A **rendition** is one processed image: a source, a size, a crop, a format
and a quality. Every rendition is made on its first request and kept. Three
mechanisms keep the cost of making them off the visitor's request.

The code wins over this page. Source files:

| File | What it does |
|---|---|
| `src/MediaStream/common/constants/rendition-presets.constant.ts` | The width ladder, the width cap, the quality ladder |
| `src/MediaStream/common/utils/rendition.util.ts` | `toRendition`: the preset a request is answered with |
| `src/MediaStream/Cache/services/rendition-size.service.ts` | The learned set of exact sizes: counts, promotes, expires, caps |
| `src/MediaStream/API/controllers/media-stream-image.controller.ts` | Applies it in `buildResizeOptions`, before the request is hashed |
| `src/MediaStream/Renditions/services/rendition-generator.service.ts` | The pre-generation cron |
| `src/MediaStream/Renditions/services/rendition-source-scanner.service.ts` | Lists the uploads on the media volume |
| `src/MediaStream/Cache/services/rendition-store.service.ts` | The rendition store: an S3-compatible bucket, with deadlines and a breaker |
| `src/MediaStream/Cache/services/rendition-catalogue.service.ts` | Learns which renditions a folder is shown at |
| `src/MediaStream/Cache/utils/image-envelope.util.ts` | The one binary form Redis and the store hold an image in |
| `src/MediaStream/Processing/services/processing-admission.service.ts` | `runAsBackground`: pre-generation yields to requests |

## Why

Measured on the production request log (VictoriaLogs, 14 days to
2026-11-01, 13.8 thousand image requests, three tenants):

- 12.7 thousand of them were cache misses. The same rendition missed again
  after every deploy: the disk tier was an `emptyDir` (gone with the pod), the
  Redis tier is evicted (the Redis instance is full by design, see
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
cache identity (the hash is the cache key, the Redis key and the store key).
**A size the storefront asks for is answered exactly**; only a size outside
that set snaps up:

| Parameter | Preset |
|---|---|
| a known size (`{width}x{height}`, 0 = unconstrained), see below | Exactly as asked, no extra pixel |
| any other width | The next step of `RENDITION_WIDTHS` at or above it (29 steps, 64 to 2048 px; 11-17 % apart from 192 px up) |
| any other height, both axes set | Follows the snapped width at the requested aspect ratio (a `cover` crop keeps its shape) |
| any other height, one axis set | Only that axis, snapped; the other stays 0 |
| both axes 0 (original size), or wider than 2048 | The 2048 cap |
| quality, AVIF | `min(requested, PROCESSING_AVIF_MAX_QUALITY)` |
| quality, WebP / JPEG / PNG | A quality in `RENDITION_QUALITIES` (75, 80, 85, 90, 100) as asked; any other rounds up to the next |
| quality, GIF / TIFF | 100 (ignored by the encoder) |
| position | `centre` is `center`; the fits that ignore it (`inside`, `outside`, `fill`) share `center` |

**Known sizes are learned from traffic**, not listed in the code, so a size the
storefront starts to use becomes exact on its own:

1. Each time the service renders a size for an upload (a first rendering, so
   the count is of uploads; it repeats only after a flush, an expiry or a
   processing-version change), it counts one in a Redis hash
   (`renditions:sizes:seen`).
2. At `RENDITION_SIZES_MIN_SOURCES` (10) the size is promoted into a Redis
   sorted set (`renditions:sizes:known`), scored by when it was last asked for.
3. A size that is asked for keeps its score fresh (each pod reports what it
   served every 30 s). One unused for `RENDITION_SIZES_WINDOW_DAYS` (30) leaves.
   Past `RENDITION_SIZES_MAX_KNOWN` (300) the least recently asked leaves
   first. A prober can therefore hold at most 300 sizes exact, each by having
   it rendered for ten uploads; the counts are pruned too, so the hash cannot
   grow without bound.
4. `0x0`, a width past the 2048 cap and a size past the pixel budget are never
   promoted.

Requests never wait for Redis: each pod reads the set into memory every minute
and answers from there. A promoted size is exact a few seconds after its tenth
rendering (one more rendering per upload at the switch). **If Redis cannot be
reached**, a pod keeps the last set it read (moving a size to a different
rendition would only cause misses); a pod that never had a set snaps
everything, and nothing errors. An empty set is seeded once from
`SEED_RENDITION_SIZES` (`common/constants/rendition-size-seed.constant.ts`):
the sizes of the 2026-10 request logs asked of at least ten uploads, plus the
672, 1200 and 1440 px single-axis widths the storefront computes itself. It is
a seed, not the source of truth: a deployment that already has a set ignores
it, and a seed entry nobody asks for leaves after the window.

Qualities are not learned: the five the storefront uses (75, 80, 85, 90, 100)
are exact and any other rounds up to the next, which costs a few points of
quality at most, not pixels.

Properties that matter:

- **No URL is refused for its size.** Every stored URL (TinyMCE content,
  feeds, sitemaps, emails) keeps working and is answered with the nearest
  preset at or above what it asked for (or exactly, for a known size). Nothing needs a storefront release
  first.
- **A rendition is never smaller than requested** (except past the cap), and
  a source narrower than the preset is never enlarged.
- **A preset maps to itself.** Pre-generated renditions and live requests
  share one cache identity.
- `fit`, `background` and `trimThreshold` are not snapped. A request with an
  aspect ratio the snap would push outside the pixel budget (1 x 8000) is
  kept as asked.

Replayed over the 14-day log (13.8 thousand requests, 911 uploads) with the
seeded set this adds **1.0 % pixels** (the tail of sizes asked of fewer than ten uploads is rounded
up; 9.6 thousand requests of the 13 thousand with a size are exact) and removes
0.6 % of the distinct renditions (4945 to 4915). The ladder is not what raises
the hit ratio: the storefront already asks each upload for few sizes. It bounds
the work and the disk a client that enumerates sizes can cause, and it makes a
pre-generation list finite. Changing the ladder re-keys the
renditions it changes and needs no `PROCESSING_VERSION` bump.

## 2. The rendition store

Behind the memory and Redis tiers, every rendition is kept in an
**S3-compatible bucket** (Cloudflare R2): one object per rendition,
`{tenant}/{id}`, holding the image envelope (metadata JSON plus bytes, the
same form Redis holds). Both replicas share it, it survives a restart or a
deploy, and it does not depend on a node. A store hit refills memory and
Redis.

**It never holds up a request.** The failure to design out is a hung call: a stalled
network-filesystem operation holds a libuv thread, and Sharp uses the same
pool, so a store on a shared volume can stall image processing for minutes. The store speaks HTTP over sockets,
which do not use that pool, and every call is bounded:

| Call | Deadline | When it fails |
|---|---|---|
| read (GET, HEAD) | `RENDITION_STORE_READ_TIMEOUT_MS`, 1 s | a miss: the request is processed |
| write (PUT, DELETE, LIST) | `RENDITION_STORE_WRITE_TIMEOUT_MS`, 5 s | the image is served uncached |

- The deadline is an abort signal given to the SDK **and** a race against it,
  so a stalled socket cannot outlive it. The SDK is told not to retry.
- Five failures in a row open a breaker for 30 s: the store is not called, a
  read is a miss at once and a write is skipped. The first call after the pause
  decides: a success closes it, a failure opens it again. A 404 is an answer,
  not a failure.
- **The response does not wait for the store write.** The image is made; a
  slow store would only slow the request. `OperationContext.stored` is the
  write's promise, which pre-generation awaits and the response ignores.
- A tenant flush deletes `{tenant}/` (list, then delete in batches of 1000)
  and is attempted even while the breaker is open: a flush is an instruction.
  What it could not delete answers 503 `TENANT_FLUSH_INCOMPLETE`, and Django
  retries. Every replica sweeps (it is idempotent), and each advances its own
  flush epoch first, so the fencing of in-flight writes is unchanged: a store
  write that a flush overtakes deletes itself.
- Objects expire by a **lifecycle rule on the bucket** (180 days, the
  private TTL), not by the service. There is no cleanup cron, no inventory and
  no access counting: they existed to manage a local disk. Cache warming went
  with them, because it read their access counts; the memory tier fills on
  demand and a store hit is one GET.
- The store is off while `RENDITION_STORE_ENDPOINT` or
  `RENDITION_STORE_BUCKET` is empty (development): only memory and Redis
  remain. `CACHE_FILE_DIRECTORY` is scratch space for source downloads in
  flight and the fallback image's renditions.

**Cost** (Cloudflare R2 pricing, developers.cloudflare.com/r2/pricing, read
2026-11-01). Free each month: 10 GB-month of Standard storage, 1 million Class A
operations (PUT, LIST), 10 million Class B operations (GET, HEAD), and egress
is always free; beyond that $0.015 per GB-month, $4.50 per million Class A,
$0.36 per million Class B. The platform's use, from the 14-day log: about 0.3 GB
stored, about 30 thousand GETs and 35 thousand PUTs a month, plus about 50
thousand HEADs for pre-generation (one per upload per pod start). That is
under 1 % of every free allowance, so the expected bill is zero.

## Where the bucket lives

A bucket in the EU jurisdiction is reached only through the jurisdiction
endpoint `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com`; the endpoint is
configuration (`RENDITION_STORE_ENDPOINT`), never a constant. Credentials are
an R2 API token scoped to object read and write on the renditions buckets
only (`RENDITION_STORE_ACCESS_KEY_ID`, `RENDITION_STORE_SECRET_ACCESS_KEY`),
delivered by a SealedSecret. The client sends only the checksums an operation
requires (`requestChecksumCalculation: 'WHEN_REQUIRED'`), the plain form every
S3-compatible server accepts.

## 3. Pre-generation

`RenditionGeneratorService` renders the renditions of an upload before
anyone asks, so the encode cost follows uploads, not traffic.

It is **level-triggered**: every `RENDITIONS_CRON` tick it compares what the
application has stored with what the cache holds. There is no event to lose
and no job queue (the service has none by design, and a restart loses
nothing: the state is the uploads and the store).

1. **Learn the catalogue.** Every rendition the service makes counts one more
   source of its upload folder (`products`, `blog`, `tinymce`) for that
   rendition, in one Redis hash (`renditions:catalogue`). A rendition made for
   at least `RENDITIONS_MIN_SOURCES` different sources of a folder is one the
   storefront shows that folder at; the most shared come first, at most
   `RENDITIONS_MAX_PER_SOURCE` per folder. Nothing is hard-coded, so a
   storefront that asks for new sizes is followed, and a new design is
   learned from its first few uploads. Redis evicts: losing the hash costs
   only the next passes, it is learned again from traffic; the hash is pruned
   of renditions too few sources share once it passes 5000 entries, so a
   client enumerating heights cannot grow it without bound.
2. **Find the uploads that lack them.** The Django backend's media volume is
   mounted read-only at `RENDITIONS_MEDIA_DIRECTORY`
   (`{dir}/{tenant}/uploads/**`). An upload is done when the last rendition
   of its folder's catalogue is in the store, which is one HEAD; an upload
   seen to be done is not asked about again until the pod restarts. A store
   that cannot answer ends the pass: unknown is not missing. Newest uploads
   first, so a new upload is ready before the backlog. Suspended stores are
   skipped. Existing images are backfilled by the same pass.
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
is served with the same headers. An upload is called done only when its last
rendition is seen in the store: a write the store refused does not fail the
encode that made it.

## Overload

Admission control is unchanged: a request that **needs an encode** beyond
the queue is still answered 503 with `Retry-After` (`ProcessingOverloadedError`).
What changes is how often that is a visitor's request:

- a stored rendition is served from memory, Redis or the store and never
  reaches admission, whatever else is queued;
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
| `RENDITION_STORE_ENDPOINT` | empty (off) | S3 API endpoint, `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` for an EU R2 bucket |
| `RENDITION_STORE_BUCKET` | empty (off) | The bucket |
| `RENDITION_STORE_ACCESS_KEY_ID`, `RENDITION_STORE_SECRET_ACCESS_KEY` | empty | An R2 token scoped to object read and write on the bucket |
| `RENDITION_STORE_READ_TIMEOUT_MS` | 1000 | Deadline of a GET or HEAD; past it the read is a miss |
| `RENDITION_STORE_WRITE_TIMEOUT_MS` | 5000 | Deadline of a PUT, DELETE or LIST; past it the image is served uncached |
| `RENDITION_SIZES_MIN_SOURCES` | 10 | Uploads a size must be rendered for before it is answered exactly |
| `RENDITION_SIZES_WINDOW_DAYS` | 30 | Days an exact size stays exact without being asked for |
| `RENDITION_SIZES_MAX_KNOWN` | 300 | Most sizes exact at once; the least recently asked leaves first |
| `RENDITIONS_MEDIA_DIRECTORY` | empty (off) | Root of the tenants' uploads: `{dir}/{tenant}/uploads/` |
| `RENDITIONS_CRON` | `*/10 * * * *` | How often the pass runs (a six-field cron with seconds works) |
| `RENDITIONS_MIN_SOURCES` | 3 | Sources of a folder that must share a rendition before it is pre-generated |
| `RENDITIONS_MAX_PER_SOURCE` | 16 | Renditions pre-generated per upload |

Pre-generation needs the store; with the store off it stays off too.

## Watching it

| Signal | Meaning |
|---|---|
| `mediastream_rendition_store_operations_total{operation,result}` | Every store call: `hit`, `miss`, `ok`, `error` (a failure or a timeout), `skipped` (the breaker was open). A run of `error` then `skipped` is a store outage |
| `mediastream_rendition_backlog_sources` | Uploads still missing renditions after the last pass; it should reach 0 and stay there |
| `mediastream_rendition_pregeneration_total{result}` | `generated`, `present` (already stored), `yielded` (a request had the slot), `failed` |
| `mediastream_processing_rejected_total{reason}` | Requests shed by admission; background yields are not in it |
| `log.cache` on the image request log | `memory`, `redis`, `store` or `miss`; `miss` should be rare on a page whose uploads are old enough |

Verifying a rollout: upload an image to a folder with history, wait one
cycle, request one of the folder's renditions. It must be `store` (or
`memory`), not `miss`; restart a pod and ask again: still `store`.

## Local reproduction

One CPU, queue 16, 10 s wait (production's admission), a local S3-compatible
server (SeaweedFS) standing in for R2. 6 existing blog images asked at the 7
renditions the storefront uses for a blog cover (history), then 30 new uploads,
then every rendition of every new upload requested at once with 40 in flight:

| | Responses | p95 |
|---|---|---|
| Without pre-generation (no store) | 22 x 200, **188 x 503** | 2.5 s |
| With pre-generation (210 renditions made in 67 s while serving) | **210 x 200** | 64 ms |
| The same 210 after a restart that empties Redis and the scratch directory | **210 x 200**, 210 store hits, 0 misses, 0 shed | 127 ms |

During that pre-generation, requests for stored renditions kept a 3 ms p95
(max 33 ms), and requests for renditions nobody had made were all served, p95
522 ms (their own encode plus at most the background encode in flight).

A store that is down or hangs, one visitor asking for 30 renditions nobody
has made, one after the other (the store endpoint is a socket that accepts and
never answers, or a closed port):

| Store | Responses | Latency |
|---|---|---|
| Off | 30 x 200 | p50 30 ms |
| Hangs | 30 x 200 | the first miss waited out the 1 s read timeout (1.2 s at most); then the breaker opened and the rest ran at p50 29 ms |
| Refuses connections | 30 x 200 | p50 30 ms |

Writes to a hanging store ran in the background (5 s deadline) and never
delayed a response. In every case the image was served; none became the
default image.
