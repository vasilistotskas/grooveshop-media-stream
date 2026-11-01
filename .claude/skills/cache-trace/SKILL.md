---
name: cache-trace
description: Reference for tracing requests through the multi-layer cache (Memory → Redis, then the rendition store) when debugging cache misses, stale entries, or pre-generation
---

Use when debugging cache hit/miss behavior, stale entries, the rendition store or pre-generation in grooveshop-media-stream.

## Layer Stack

`MultiLayerCacheManager` (`src/MediaStream/Cache/services/multi-layer-cache.manager.ts`) registers two layers, sorted by `getPriority()`:

1. **Memory** (`memory-cache.service.ts`) — NodeCache. Defaults: TTL 3600s (`CACHE_MEMORY_DEFAULT_TTL`), maxKeys 1000 (`CACHE_MEMORY_MAX_KEYS`), maxSize 100MB (`CACHE_MEMORY_MAX_SIZE`), checkPeriod 600s.
2. **Redis** (`redis-cache.service.ts`) — ioredis. Default TTL 7200s (`REDIS_TTL`). Key pattern `image:*` (`IMAGE_KEY_PATTERN` in `cache-namespace.util.ts`). `clear()` deletes `image:*` via SCAN + DEL, never `FLUSHDB` — the DB also holds rate-limit counters and circuit-breaker state.

> The **rendition store** (`rendition-store.service.ts`) is NOT a registered cache layer in `MultiLayerCacheManager`. It is an S3-compatible bucket (Cloudflare R2) shared by every replica, read by `CacheImageResourceOperation.checkResourceExists()` after the layered lookup and written after processing. Every call has a deadline, the SDK does not retry, and five failures in a row open a 30 s breaker; a failing read is a miss and a failing write leaves the image uncached. Its metrics are `mediastream_rendition_store_operations_total{operation,result}`. The `cache` field of the image request log says which tier answered: `memory`, `redis`, `store` or `miss`.

## Lookup Order (read path)

`MultiLayerCacheManager.lookup()`:

1. Iterate `this.layers` by priority ascending (Memory first, Redis second).
2. Return on the first hit.
3. On hit from a lower-priority layer, fire-and-forget `backfillLayers()` to populate higher-priority layers, **preserving the source layer's remaining TTL** (`sourceLayer.getTtl(key)`).
4. **Backfill MUST stay non-awaited** — awaiting it serializes every cache hit on the slowest layer. See performance-analyzer guidance.

## Negative Caching

- Where: `ResourceFetcher` (`Cache/operations/resource-fetcher.service.ts`), stored under `negative:{resourceId}` in the tenant's `image:` namespace.
- TTL: `cache.image.negativeCacheTtl` (`CACHE_IMAGE_NEGATIVE_TTL`, default 300 s) for failed upstream fetches.
- Purpose: prevents repeated failed HTTP requests from hammering the backend.

## Pre-generation

`RenditionGeneratorService` (`Renditions/services/`) renders the renditions of every upload ahead of time (`docs/renditions.md`). What it renders is the catalogue in `rendition-catalogue.service.ts`: a Redis hash (`renditions:catalogue`) counting, per upload folder, the sources each rendition was made for. Redis evicts, so an empty catalogue after an eviction is expected; it is learned again from traffic.

## Common Debug Questions

- **Cache miss for an image that was just fetched**: check Memory TTL/maxKeys (LRU eviction), then check Redis with `redis-cli -n "${REDIS_DB:-0}" --scan --pattern 'image:*' | head`.
- **Stale entry served**: TTL preserved during backfill — verify the source layer's TTL is correct, not the destination's.
- **Every miss after a deploy**: the store is off or failing. Check `mediastream_rendition_store_operations_total` for `error` and `skipped` (breaker open), and `RENDITION_STORE_ENDPOINT` / `RENDITION_STORE_BUCKET`.
- **A new upload still misses**: pre-generation needs `RENDITIONS_MEDIA_DIRECTORY`, the store, and a catalogue for the upload's folder (`HGETALL renditions:catalogue` in the service's Redis DB); `mediastream_rendition_backlog_sources` says how many uploads are waiting.
- **Backfill blocking requests**: search for any `await this.backfillLayers(` — there should be none in the request path.

## Don't Mix Up

- The rendition store ≠ a cache layer, and `./storage` (`CACHE_FILE_DIRECTORY`) is only scratch space: the `.rst` temp file of a source download in flight and the fallback image's renditions.
- "Cache layers" in metrics (`recordCacheOperation`) refer to Memory/Redis, not the rendition store.
