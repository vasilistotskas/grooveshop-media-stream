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
| `src/MediaStream/Cache/services/rendition-size.service.ts` | The exact sizes: the contract list, and the learned set (counts, promotes, expires, caps) |
| `src/MediaStream/API/controllers/media-stream-image.controller.ts` | Applies it in `buildResizeOptions`, before the request is hashed |
| `src/MediaStream/Renditions/services/rendition-generator.service.ts` | The pre-generation cron |
| `src/MediaStream/Renditions/services/rendition-source-scanner.service.ts` | Lists the uploads on the media volume |
| `src/MediaStream/Cache/services/rendition-store.service.ts` | The rendition store: an S3-compatible bucket, with deadlines and a breaker |
| `src/MediaStream/Cache/services/rendition-catalogue.service.ts` | Learns which renditions a folder is shown at |
| `src/MediaStream/Cache/utils/image-envelope.util.ts` | The one binary form Redis and the store hold an image in |
| `src/MediaStream/Processing/services/processing-admission.service.ts` | `runAsBackground`: pre-generation yields to requests |

## Why

Without these mechanisms the cost of a rendition falls on a visitor:

- A rendition is lost whenever its copy is: the memory tier is per pod and
  empties on every deploy, and the shared Redis is full by design and evicts
  (`grooveshop-infrastructure/docs/redis.md`). The same rendition then misses
  again.
- A miss costs an encode (AVIF is the slowest, seconds on a production core)
  behind a bounded admission queue, one pipeline per core. A burst of
  first-time requests (a Lighthouse run, a new store, a new layout) overflows
  it and is answered 503.
- Clients choose sizes. Real traffic asks for many distinct size combinations
  and widths, and a share of them are `0 x 0` or one-axis requests from
  TinyMCE content, whose HTML stores the URL, so a storefront release cannot
  change them.

## 1. Presets: what is made is a finite set

`toRendition` maps every request to a preset before it is hashed into its
cache identity (the hash is the cache key, the Redis key and the store key).
**A size the storefront asks for is answered exactly**; only a size outside
that set snaps up:

| Parameter | Preset |
|---|---|
| a contract size, see below | Exactly as asked, always |
| a known size (`{width}x{height}`, 0 = unconstrained), see below | Exactly as asked, no extra pixel |
| any other width | The next step of `RENDITION_WIDTHS` at or above it (29 steps, 64 to 2048 px; 11-17 % apart from 192 px up) |
| any other height, both axes set | Follows the snapped width at the requested aspect ratio (a `cover` crop keeps its shape) |
| any other height, one axis set | Only that axis, snapped; the other stays 0 |
| both axes 0 (original size), or wider than 2048 | The 2048 cap |
| quality, AVIF | `min(requested, PROCESSING_AVIF_MAX_QUALITY)` |
| quality, WebP / JPEG / PNG | A quality in `RENDITION_QUALITIES` (75, 80, 85, 90, 100) as asked; any other rounds up to the next |
| quality, GIF / TIFF | 100 (ignored by the encoder) |
| position | `centre` is `center`; the fits that ignore it (`inside`, `outside`, `fill`) share `center` |

**Contract sizes are listed** (`RENDITION_SIZES_CONTRACT`, default
`1200x630,1200x675,1200x900,1200x1200`): the sizes another service publishes as
metadata with the URL, so it states the served size without fetching the image.
The storefront writes `og:image:width`/`height` for its 1200x630 og image and
the width and height of the Article's three schema.org `ImageObject`s (16:9, 4:3,
1:1) from the upload's stored size. A learned size can be evicted and a snapped
one is wider than asked, and either would make that metadata false, so a
contract size is exact on every pod from the first request, Redis or not, and
is never counted, seeded or kept in the learned set: one found there (learned
before it was listed, or promoted by a pod of an earlier release during a
rollout) is removed on the next refresh, so it holds none of the 300 slots. Both axes must be set, and
an entry past the width cap, the height cap or the pixel budget stops the service at boot. The
size served for a contract size, `cover`, is the box scaled down to fit the
source, never up (`boxWithinSource`): when the source covers the box on both
axes it is the box; otherwise the axis with the smaller `sourceAxis /
requestAxis` ratio is the source's and the other is `Math.round(otherAxis *
(sourceAxis / requestAxis))`, never past the source. A 1080x1080 upload asked
for 1200x630 is 1080x567. Evaluate it exactly so, in a double, in that order:
a .5 case can round down (`675 * (440 / 1200)` is 247.49999999999997, so a
440 px wide upload asked for 1200x675 is 440x247, where exact rational rounding
says 248). The
real-Sharp spec `webp-image-manipulation.job.real-sharp.spec.ts` pins it. Keep
every size the storefront states in the list: removing one makes its metadata
false for every new rendition.

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
reached** the service degrades on purpose (this is not a fallback path): a
pod keeps the last set it read, because moving a size to a different rendition
would turn a Redis blip into a wave of misses; a pod that never had a set snaps
everything. Nothing errors. An empty set is seeded once from
`SEED_RENDITION_SIZES` (`common/constants/rendition-size-seed.constant.ts`):
the sizes the request logs show asked of at least ten uploads (less the
contract sizes, which need no learning), plus the 672, 1200 and 1440 px
single-axis widths the storefront computes itself. It is
a seed, not the source of truth: a deployment that already has a set ignores
it, and a seed entry nobody asks for leaves after the window. To refresh it,
count distinct uploads per size in the request log (`log.context:="ImageRequest"
| stats by (log.width, log.height) count_uniq(log.path)`) and keep the sizes
asked of at least ten.

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

The ladder is not what raises the hit ratio: the storefront already asks each
upload for few sizes. It bounds the work and the storage a client that
enumerates sizes can cause, and it makes a pre-generation list finite.
Changing the ladder re-keys the renditions it changes and needs no
`PROCESSING_VERSION` bump.

## 2. The rendition store

Behind the memory and Redis tiers, every rendition is kept in an
**S3-compatible bucket** (Cloudflare R2): one object per rendition,
`{tenant}/{id}`, holding the image envelope (metadata JSON plus bytes, the
same form Redis holds). Every replica shares it, it survives a restart or a
deploy, and it does not depend on a node. A store hit refills memory and
Redis.

**It never holds up a request.** The failure to design out is a hung call: a stalled
network-filesystem operation holds a libuv thread, and Sharp uses the same
pool, so a store on a shared volume can stall image processing for minutes. The store speaks HTTP over sockets,
which do not use that pool, and every call is bounded:

| Call | Deadline | When it fails |
|---|---|---|
| read (GET, HEAD) | `RENDITION_STORE_READ_TIMEOUT_MS`, 2 s | a miss: the request is processed |
| write (PUT, DELETE, LIST) | `RENDITION_STORE_WRITE_TIMEOUT_MS`, 5 s | the image is served uncached |

- The deadline is an abort signal given to the SDK **and** a race against it,
  so a stalled socket cannot outlive it. The SDK is told not to retry.
- **The read deadline is measured, not guessed.** From a pod with a 500m CPU
  limit to R2 in the EU jurisdiction, a GET on a reused connection had a p99
  under half a second, a new TLS connection adds about 70 ms, and 50 HEADs at
  once (which open 50 sockets) took about a second. 2 s is past every call
  measured, and still below what a timed-out read costs instead: an encode of
  a first-time rendition. The SDK keeps connections alive (its default agent,
  `keepAlive`, 50 sockets), so only a burst pays a handshake per call.
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
  private TTL), not by the service. There is no cleanup cron, no inventory, no
  access counting and no cache warming: the memory tier fills on demand and a
  store hit is one GET.
- The store is off while `RENDITION_STORE_ENDPOINT` or
  `RENDITION_STORE_BUCKET` is empty (development): only memory and Redis
  remain. `CACHE_FILE_DIRECTORY` is scratch space for source downloads in
  flight and the fallback image's renditions.

**Cost.** Cloudflare R2 charges for storage and for Class A (PUT, LIST) and
Class B (GET, HEAD) operations, not for egress, and has a monthly free
allowance (developers.cloudflare.com/r2/pricing). What the service adds to the
bill grows with uploads and renditions, plus one HEAD per rendition of each
upload not yet known to be complete for pre-generation, repeated at every pod
start. Read the bucket's usage in the Cloudflare dashboard rather than
assuming it stays inside the allowance.

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
   (`{dir}/{tenant}/uploads/**`). An upload is done when every rendition of
   its folder's catalogue is in the store: one HEAD each, least shared
   first, up to the first one missing. No single rendition can stand for the
   rest, because a visitor, a refused write or the bucket's expiry can leave
   any of them absent. An upload seen to be done is not asked about again
   until the pod restarts or the catalogue of its folder changes (a new
   rendition, not a new order). At most 8 checks are in flight
   (`CHECK_CONCURRENCY`): 50 at once on a pod with a CPU limit spent the read
   deadline on TLS handshakes, lost every check and opened the breaker for live
   requests. An upload the store could not answer about is left to the next
   pass (unknown is not missing), and so is a rendition whose check failed
   while rendering: it is not rendered blind. The pass ends only when the
   breaker opens, which is the one case logged as an error. Newest uploads
   first, so a new upload is ready before the backlog. Suspended stores are
   skipped. Existing images are backfilled by the same pass.
3. **Render them as background work.** `runAsBackground` admits a pipeline
   only when no request holds or awaits a slot (a `BackgroundYieldError`
   otherwise, which counts as no shed and no error), so a request is delayed
   by at most the encode already running. A Redis lock per upload keeps the
   replicas off the same one. A cycle ends after five minutes and the next
   tick rescans. The result goes to the store only, not to the memory and
   Redis tiers (`OperationContext.storeOnly`): those hold what visitors ask
   for, and a pass renders a folder's whole catalogue for every upload, most
   of it asked for rarely, which would fill the shared Redis with idle
   entries. A visitor's first request for a rendition is a store
   hit, which fills both tiers.
4. **Leave what cannot be rendered alone** (source missing, too large, not
   an image, or a request that cannot be built) for six hours, in memory, so a
   bad upload is not retried every cycle. Each failure is one WARN line with
   the upload, the rendition and the error as fields (`log.schema`,
   `log.upload`, `log.width`/`height`/`format`, `log.error_class`,
   `log.error`; `docs/observability.md`). A failure while checking an upload
   is reported the same way and fails only that upload, never the pass.

The pre-generated rendition is produced by the same `execute()` as a live
request, so it is byte-identical to what the request would have produced and
is served with the same headers. An upload is called done only when each of
its renditions is seen in the store or was written to it: a write the store
refused does not fail the encode that made it, it leaves the upload to the
next pass.

## Overload

Admission control still applies: a request that **needs an encode** beyond
the queue is answered 503 with `Retry-After` (`ProcessingOverloadedError`).
Pre-generation keeps that from being a visitor's request most of the time:

- a stored rendition is served from memory, Redis or the store and never
  reaches admission, whatever else is queued;
- the renditions a folder is shown at are stored when its upload is, so a
  visitor of a new page finds them;
- what is left is a rendition nobody learned yet (a new size, a new
  design), the first time.

There is no "serve the nearest rendition or the original instead of a 503":
the original can be several MB, an SVG original must not be served
unsanitised, and an edge that caches a stand-in under the real URL would pin
it for the TTL.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `RENDITION_STORE_ENDPOINT` | empty (off) | S3 API endpoint, `https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` for an EU R2 bucket |
| `RENDITION_STORE_BUCKET` | empty (off) | The bucket |
| `RENDITION_STORE_ACCESS_KEY_ID`, `RENDITION_STORE_SECRET_ACCESS_KEY` | empty | An R2 token scoped to object read and write on the bucket |
| `RENDITION_STORE_READ_TIMEOUT_MS` | 2000 | Deadline of a GET or HEAD; past it the read is a miss (see "The rendition store") |
| `RENDITION_STORE_WRITE_TIMEOUT_MS` | 5000 | Deadline of a PUT, DELETE or LIST; past it the image is served uncached |
| `RENDITION_SIZES_MIN_SOURCES` | 10 | Uploads a size must be rendered for before it is answered exactly |
| `RENDITION_SIZES_WINDOW_DAYS` | 30 | Days an exact size stays exact without being asked for |
| `RENDITION_SIZES_MAX_KNOWN` | 300 | Most learned sizes exact at once; the least recently asked leaves first |
| `RENDITION_SIZES_CONTRACT` | `1200x630,1200x675,1200x900,1200x1200` | Sizes always answered exactly: the ones the storefront states as metadata |
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
