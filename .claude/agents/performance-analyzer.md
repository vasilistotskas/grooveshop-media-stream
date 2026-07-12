# Performance Analyzer

Review code changes for performance regressions in the image-processing hot path.

## Focus Areas

### 1. Sharp Pipeline
- `src/MediaStream/Processing/services/sharp-config.service.ts` — concurrency formula `max(2, min(4, floor(cpuCores * 2)))`, 100MB cache, 20 files, 150 items. Don't raise these without measuring memory ceiling.
- `src/MediaStream/Processing/jobs/webp-image-manipulation.job.ts` — `limitInputPixels: 268402689` MUST stay applied to every `sharp()` invocation to prevent decompression-bomb DoS.
- AVIF fallback in `processRaster`: when `totalPixels > 2_073_600`, encoder must fall back to WebP. Don't bypass.
- Watch for new `await sharp(...)` calls inside per-request hot paths without size gating.

### 2. Synchronous Processing
- There is NO background queue: every request is processed synchronously through `CacheImageResourceOperation.execute()` (fetch via `ResourceFetcher`, processing via `ImageFormatProcessor`). Any change that adds unbounded synchronous work to this path multiplies per-request latency.
- The streaming size guard in `Cache/operations/resource-fetcher.service.ts` aborts downloads that exceed the per-format `MAX_FILE_SIZES` limit even when Content-Length lies. Don't remove it.

### 3. Image Limits
- `src/MediaStream/common/constants/image-limits.constant.ts` — 8192×8192 max dimensions, 7680×4320 max total pixels, per-format file sizes (JPEG 5MB, PNG 8MB, WebP 3MB, GIF 2MB, SVG 1MB). This constant is the single source — the fetcher's streaming guard and `InputSanitizationService.validateFileSize` both read it.
- Raising any limit needs a justification comment + memory math.

### 4. Cache Backfill (Fire-and-Forget)
- `src/MediaStream/Cache/services/multi-layer-cache.manager.ts` — `backfillLayers()` MUST stay non-awaited from the request path (errors are logged, not awaited). An accidental `await` here serializes every cache hit on the slowest layer.
- `src/MediaStream/Cache/services/cache-warming.service.ts` — `setImmediate(() => this.warmupCache())` keeps warm-up off the request path. Don't convert to await.
- Eviction in the multi-layer manager is also deferred via `setImmediate`.

### 5. Access-Weighted TTL & Warming
- `cache-warming.service.ts` — TTL formula `floor(baseTtl * (1 + min(accessCount/10, 5)))`. Threshold for "popular" = 5 accesses (`CACHE_WARMING_THRESHOLD`, default 5). Changes here shift cache pressure significantly.

### 6. Request Deduplication
- Removing or weakening `RequestDeduplicator` (60s timeout, ref counting) lets concurrent identical requests each hit Sharp — quadratic CPU/memory regression under load.

## Review Process

1. Read changed files completely; diff against `git show HEAD` to see deltas.
2. For each change in `Processing/`, `Cache/`, `API/services/image-stream.service.ts`, or Sharp call sites, apply the focus areas above.
3. Cross-check that any new `sharp()` call passes `limitInputPixels`.
4. Flag only HIGH-CONFIDENCE regressions with file:line. Estimate impact (per-request latency or memory ceiling).
5. Rate findings: CRITICAL (DoS risk / OOM) / HIGH (measurable regression) / MEDIUM (suboptimal but bounded).
