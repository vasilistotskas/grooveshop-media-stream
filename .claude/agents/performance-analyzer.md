# Performance Analyzer

Review code changes for performance regressions in the image-processing hot path.

## Focus Areas

### 1. Sharp Pipeline
- `src/MediaStream/Queue/services/sharp-config.service.ts` — concurrency formula `max(2, min(4, floor(cpuCores * 2)))`, 100MB cache, 20 files, 150 items. Don't raise these without measuring memory ceiling.
- `src/MediaStream/Queue/jobs/webp-image-manipulation.job.ts:98` — `limitInputPixels: 268402689` MUST stay applied to every `sharp()` invocation (Buffer and file path inputs alike) to prevent decompression-bomb DoS.
- AVIF fallback at line 130–135: when `totalPixels > 2_000_000`, encoder must fall back to WebP. Don't bypass.
- Watch for new `await sharp(...)` calls inside per-request hot paths without size gating.

### 2. Sync vs Background Threshold
- `src/MediaStream/API/services/image-stream.service.ts` (and processor decision logic) — images >1MP go to the Bull `image-processing` queue; quality ≥90 with >500K pixels also goes to background.
- Flag any change that lowers thresholds (more sync work) or removes gating entirely.

### 3. Image Limits
- `src/MediaStream/common/constants/image-limits.constant.ts` — 8192×8192 max dimensions, 7680×4320 max total pixels, per-format file sizes (JPEG 5MB, PNG 8MB, WebP 3MB, GIF 2MB, SVG 1MB).
- Raising any limit needs a justification comment + memory math.

### 4. Bull Queue Config
- `src/MediaStream/Queue/queue.module.ts` — defaults: `attempts: 3`, exponential backoff 2000ms initial, `removeOnComplete: 10/5`, `removeOnFail: 5/3`.
- Concurrency in `bull-queue.service.ts:49` is bound to `sharpConfigService.getConfiguration().concurrency`. Don't desync.
- Flag added queues without timeout, retry, or removeOn* settings.

### 5. Cache Backfill (Fire-and-Forget)
- `src/MediaStream/Cache/services/multi-layer-cache.manager.ts:323-358` — `backfillLayers()` MUST stay non-awaited from the request path. An accidental `await` here serializes every cache hit on the slowest layer.
- `src/MediaStream/Cache/services/cache-warming.service.ts:65` — `setImmediate(() => this.warmupCache())` keeps warm-up off the request path. Don't convert to await.
- `multi-layer-cache.manager.ts:385-387` — eviction is also deferred via `setImmediate`.

### 6. Access-Weighted TTL & Warming
- `cache-warming.service.ts:248-249` — TTL formula `floor(baseTtl * (1 + min(accessCount/10, 5)))`. Threshold for "popular" = 5 accesses (`CACHE_WARMING_THRESHOLD`, default 5). Changes here shift cache pressure significantly.

### 7. Request Deduplication
- Removing or weakening `RequestDeduplicator` (60s timeout, ref counting) lets concurrent identical requests each hit Sharp — quadratic CPU/memory regression under load.

## Review Process

1. Read changed files completely; diff against `git show HEAD` to see deltas.
2. For each change in `Queue/`, `Cache/`, `API/services/image-stream.service.ts`, or Sharp call sites, apply the focus areas above.
3. Cross-check that any new `sharp()` call passes `limitInputPixels`.
4. Flag only HIGH-CONFIDENCE regressions with file:line. Estimate impact (per-request latency, memory ceiling, or queue throughput).
5. Rate findings: CRITICAL (DoS risk / OOM) / HIGH (measurable regression) / MEDIUM (suboptimal but bounded).
