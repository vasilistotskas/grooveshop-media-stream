---
name: cache-trace
description: Reference for tracing requests through the multi-layer cache (Memory → Redis, plus file storage) when debugging cache misses, stale entries, or warming behavior
disable-model-invocation: false
---

Use when debugging cache hit/miss behavior, stale entries, warming, or eviction in grooveshop-media-stream.

## Layer Stack

`MultiLayerCacheManager` (`src/MediaStream/Cache/services/multi-layer-cache.manager.ts`) registers two layers, sorted by `getPriority()`:

1. **Memory** (`memory-cache.service.ts`) — NodeCache. Defaults: TTL 3600s (`CACHE_MEMORY_DEFAULT_TTL`), maxKeys 1000 (`CACHE_MEMORY_MAX_KEYS`), maxSize 100MB (`CACHE_MEMORY_MAX_SIZE`), checkPeriod 600s.
2. **Redis** (`redis-cache.service.ts`) — ioredis. Default TTL 7200s (`REDIS_TTL`). Key pattern `image:*` (`IMAGE_KEY_PATTERN` in `cache-namespace.util.ts`). `clear()` deletes `image:*` via SCAN + DEL, never `FLUSHDB` — the DB also holds rate-limit counters and circuit-breaker state.

> The "file system cache" mentioned in CLAUDE.md is **NOT** a registered cache layer in `MultiLayerCacheManager`. It's the persistence layer used by `CacheImageResourceOperation` (`.rsc` data, `.rsm` metadata JSON, `.rst` temp during write). Treat it as orthogonal to the multi-layer flow.

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

## Access-Weighted TTL

`CacheWarmingService` (`cache-warming.service.ts`), when it warms a file:

```
ttl = floor(baseCacheTtl * (1 + min(accessCount / 10, 5)))
```

Examples: accessCount=5 → multiplier 1.5 → TTL = base × 1.5. accessCount≥50 → multiplier 6 (capped). Popular files live up to 6× longer.

## Cache Warming

- Threshold: ≥5 accesses (`CACHE_WARMING_THRESHOLD`, default 5), filtered against `popularImageThreshold` in `cache-warming.service.ts`.
- Schedule: cron from `CACHE_WARMING_CRON` env, default every 6 hours.
- Trigger style: `setImmediate(() => this.warmupCache())` for the boot-time warm-up — must stay non-awaited.
- Stored shape in warmup paths: `{ data: Buffer, metadata: ResourceMetaData }`.

## Common Debug Questions

- **Cache miss for an image that was just fetched**: check Memory TTL/maxKeys (LRU eviction), then check Redis with `redis-cli -n 0 KEYS "image:*"`.
- **Stale entry served**: TTL preserved during backfill — verify the source layer's TTL is correct, not the destination's.
- **Warmer not warming a known-popular image**: confirm `accessCount >= 5` in its `ResourceMetaData` (`.rsm` JSON file). Access count is bumped on every served image (`loadResource` and a fresh `persist` in `CacheImageResourceOperation`) by `AccessCountTracker` (batched; flushed every 30 s / 1000 pending / shutdown).
- **Backfill blocking requests**: search for any `await this.backfillLayers(` — there should be none in the request path.

## Don't Mix Up

- File storage (`.rsc/.rst/.rsm` in `./storage`) ≠ a cache layer. It's where `CacheImageResourceOperation` persists processed images for re-streaming, including atomic write via `.rst` temp file.
- "Cache layers" in metrics (`recordCacheOperation`) refer to Memory/Redis, not file storage.
