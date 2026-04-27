---
name: cache-trace
description: Reference for tracing requests through the multi-layer cache (Memory → Redis, plus file storage) when debugging cache misses, stale entries, or warming behavior
disable-model-invocation: false
---

Use when debugging cache hit/miss behavior, stale entries, warming, or eviction in grooveshop-media-stream.

## Layer Stack

`MultiLayerCacheManager` (`src/MediaStream/Cache/services/multi-layer-cache.manager.ts`) registers two layers, sorted by `getPriority()`:

1. **Memory** (`memory-cache.service.ts`) — NodeCache. Defaults: TTL 3600s (`CACHE_MEMORY_DEFAULT_TTL`), maxKeys 1000 (`CACHE_MEMORY_MAX_KEYS`), maxSize 100MB (`CACHE_MEMORY_MAX_SIZE`), checkPeriod 600s.
2. **Redis** (`redis-cache.service.ts`) — ioredis. Default TTL 7200s (`REDIS_TTL`). Key pattern `image:*` (see line 269). `flushAll()` issues `FLUSHDB` (current DB only — Redis is shared with Django/Nuxt/Celery).

> The "file system cache" mentioned in CLAUDE.md is **NOT** a registered cache layer in `MultiLayerCacheManager`. It's the persistence layer used by `CacheImageResourceOperation` (`.rsc` data, `.rsm` metadata JSON, `.rst` temp during write). Treat it as orthogonal to the multi-layer flow.

## Lookup Order (read path)

`multi-layer-cache.manager.ts` lines 69–96:

1. Iterate `this.layers` by priority ascending (Memory first, Redis second).
2. Return on the first hit.
3. On hit from a lower-priority layer, fire-and-forget `backfillLayers()` (lines 323–358) to populate higher-priority layers, **preserving the source TTL** (lines 330–336).
4. **Backfill MUST stay non-awaited** — awaiting it serializes every cache hit on the slowest layer. See performance-analyzer guidance.

## Negative Caching

- Where: `src/MediaStream/Cache/operations/cache-image-resource.operation.ts:78`.
- TTL: 300s (5 min) for failed upstream fetches.
- Purpose: prevents repeated failed HTTP requests from hammering the backend.

## Access-Weighted TTL

`cache-warming.service.ts` lines 248–249:

```
ttl = floor(baseCacheTtl * (1 + min(accessCount / 10, 5)))
```

Examples: accessCount=5 → multiplier 1.5 → TTL = base × 1.5. accessCount≥50 → multiplier 6 (capped). Popular files live up to 6× longer.

## Cache Warming

- Threshold: ≥5 accesses (`CACHE_WARMING_THRESHOLD`, default 5). Filter at `cache-warming.service.ts:206`.
- Schedule: cron from `CACHE_WARMING_CRON` env, default every 6 hours.
- Trigger style: `setImmediate(() => this.warmupCache())` at line 65 — must stay non-awaited.
- Stored shape in warmup paths: `{ data: Buffer, metadata: ResourceMetaData }`.

## Eviction

`multi-layer-cache.manager.ts:385–387` — eviction is deferred via `setImmediate` so it never blocks the request path.

## Common Debug Questions

- **Cache miss for an image that was just fetched**: check Memory TTL/maxKeys (LRU eviction), then check Redis with `redis-cli -n 0 KEYS "image:*"`.
- **Stale entry served**: TTL preserved during backfill — verify the source layer's TTL is correct, not the destination's.
- **Warmer not warming a known-popular image**: confirm `accessCount >= 5` in its `ResourceMetaData` (`.rsm` JSON file). Access count is incremented on every multi-layer hit.
- **`flushAll` didn't clear other services**: expected. `FLUSHDB` is DB-scoped.
- **Backfill blocking requests**: search for any `await this.backfillLayers(` — there should be none in the request path.

## Don't Mix Up

- File storage (`.rsc/.rst/.rsm` in `./storage`) ≠ a cache layer. It's where `CacheImageResourceOperation` persists processed images for re-streaming, including atomic write via `.rst` temp file.
- "Cache layers" in metrics (`recordCacheOperation`) refer to Memory/Redis, not file storage.
