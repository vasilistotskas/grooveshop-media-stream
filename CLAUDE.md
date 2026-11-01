# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS microservice for image processing and streaming, part of the Grooveshop platform. Fetches images from a backend service, resizes/converts them using Sharp, caches results across multiple layers, and streams them to clients.

## Commands

```bash
pnpm install              # Install dependencies
pnpm run dev              # Development with watch mode (nest start --watch, SWC)
pnpm run build            # Production build (SWC compiler via nest-cli)
pnpm run prod             # Run production build (node build/dist/main.js)
pnpm run lint             # ESLint with auto-fix (whole repo)
pnpm run lint:ci          # ESLint without fixing (what CI runs)
pnpm run type-check       # Two tsc passes: src (strict) + specs (tsconfig.spec.json)
pnpm run test             # Unit + integration tests (vitest; coverage off)
pnpm run test:coverage    # Same suite with coverage and the floors from vitest.config.ts
pnpm run test:e2e         # E2E tests (separate vitest config)
pnpm run test:perf        # Performance specs (wall-clock assertions; excluded from `test`)
pnpm run cache:clear      # Clear Redis + file system cache
```

Run a single test file: `pnpm exec vitest run src/test/Cache/services/memory-cache.service.spec.ts --no-coverage`. Use `pnpm exec`, never `npx`. Tests require Redis running locally (the CI service image is in `.github/workflows/ci.yml`).

## Architecture

### Request Flow

1. **Request** hits `MediaStreamImageController` via catch-all route `GET /media_stream-image/*`
2. Controller percent-decodes the path (`decodePathFully`, up to 3 passes) and matches it against `IMAGE_SOURCES` patterns (compiled to RegExp at startup)
3. `RequestValidatorService` validates every string param with `SecurityCheckerService`, the tenant schema pattern, the enum params (fit/position/format), numeric ranges (width/height 0–8192, quality 1–100, trimThreshold 0–100; 0 means "use original dimensions") and the total-pixel budget (7680×4320). Everything here is a **400**; the pipeline downstream assumes clean input
4. A suspended store is refused here, before any cache tier is read: `TenantDomainsService.isSuspended(tenantSchema)` (Django's tenant feed lists it) throws `TenantSuspendedError`, **503** with `Cache-Control: no-store`, logged at WARN, `outcome=suspended`. 503 like Django's answer to the store's own requests: the store exists and the condition is temporary. Static images (`public`) are never gated
5. `UrlBuilderService` builds the upstream URL from `backend.url` + the source pattern; `ResourceValidationService.validateUrl` enforces http(s) and the host allowlist (SSRF guard)
6. `ImageStreamService` orchestrates: one layered cache lookup → conditional requests (ETag/If-Modified-Since → 304) → request deduplication per resource id → fetch & process → `res.end(buffer)`. Anything that fails inside it serves `public/default.png` (processed to the requested format), except capacity errors (`ProcessingOverloadedError`, `ProcessingTimeoutError`, answered 503 so clients retry) and a failing fallback (`DefaultImageFallbackError`, 500), which propagate to the exception filter
7. `CacheImageResourceOperation` uses a stateless **OperationContext** (`request`, `id`, `metaData`, `cached`, `cacheTier`, `stored`) so concurrent requests never share state. `ResourceFetcher` owns negative caching (5 min TTL) + the streamed download: it sniffs the real format from the first kilobyte (`Cache/utils/image-format-sniff.util.ts`), refuses anything but JPEG/PNG/WebP/GIF/TIFF/AVIF/SVG (`UnsupportedSourceFormatError`), then applies that format's size limit; the sniffed format also picks the SVG or raster pipeline. `ImageFormatProcessor` owns SVG sanitisation, raster processing and the default-image fallback; the rendition store keeps the result for every replica (see Multi-Layer Cache)

### Module System

All source code lives under `src/MediaStream/`. Each domain is a NestJS module:

- **API** — Controller, DTOs (`ResizeOptions`, `CacheImageRequest`, `RESIZE_DEFAULTS`), image source config, request validation, URL building, image streaming
- **Cache** — Memory → Redis layers behind `MultiLayerCacheManager`, the `RenditionStoreService` (S3-compatible bucket) behind them, `RenditionCatalogueService`, `CacheImageResourceOperation` + collaborators (`ResourceFetcher`, `ImageFormatProcessor`), cache-namespace helper, admin flush endpoint
- **Config** — `ConfigService.get(key)` over the schema-built config. `APP_CONFIG_SCHEMA` in `common/utils/config-schema.util.ts` is the **single source of truth** for every key, env-var mapping and default; the DTOs in `Config/dto/` carry constraints only (no defaults) and are validated at startup as a completeness check. There is no `getOptional`: an unknown key is a programming error. Add a key to the schema + interface + DTO + `.env.example` together
- **Correlation** — Request correlation IDs (AsyncLocalStorage), timing middleware, per-request performance phases
- **Health** — Health indicators (disk space of the scratch directory, memory, Sharp, cache, Redis, HTTP, tenant domains); thresholds are code constants
- **HTTP** — HTTP client with retry and a Redis-persisted circuit breaker
- **Metrics** — Prometheus metrics via prom-client (prefixed `mediastream_`)
- **Processing** — Stateless Sharp jobs (fetch, identity generation, format manipulation) and `SharpConfigService` (global Sharp concurrency/cache/SIMD applied at boot)
- **RateLimit** — `AdaptiveRateLimitGuard` (`CanActivate`) over `RateLimitService`: a Redis Lua counter (EVALSHA via `defineCommand`) with an in-memory fallback. `RATE_LIMIT_ENABLED=false` is the only kill-switch; there is no development-mode skip
- **Renditions** — Pre-generation of an upload's renditions (`RenditionGeneratorService` cron, `RenditionSourceScanner`, the catalogue in `Cache/`); off while `RENDITIONS_MEDIA_DIRECTORY` or the rendition store is unset. See `docs/renditions.md`
- **Validation** — `SecurityCheckerService` (injection/traversal/encoded-payload detection on strings), `ResourceValidationService` (URL allowlist, per-format size caps), `TenantDomainsService` (Django's tenant feed, polled every `TENANT_DOMAINS_REFRESH_INTERVAL_MS` and re-read on every tenant flush: active tenants' domains for the host allowlist, and the suspended stores whose images are refused; a deny list, so a store created between polls is served and a feed that never loaded refuses nothing)

Scheduled tasks use `@nestjs/schedule`'s `SchedulerRegistry.addCronJob()` with config-driven schedules (`RENDITIONS_CRON`, read at boot). There are no `@Cron` decorators.

### Shared helpers (`common/`)

- `utils/error-message.util.ts` — `errorMessage(err)`; never `(err as Error).message` on a caught value
- `utils/runtime-env.util.ts` — `nodeEnv()/isProduction()/isTest()`; the only reader of `NODE_ENV`
- `utils/storage-path.util.ts` — `storageDirectory(configService)`; every class that touches the scratch directory (`CACHE_FILE_DIRECTORY`: downloads in flight and the fallback image's renditions, not a cache) resolves it here
- `utils/percent-decode.util.ts`, `utils/bytes.util.ts`, `utils/ip.util.ts`, `utils/tenant-path.util.ts`, `utils/etag.util.ts`
- `Cache/utils/cache-namespace.util.ts` — `imageNamespace(tenant)`, `cacheKey`, `tenantFromNamespace`, `IMAGE_KEY_PATTERN`
- `errors/media-stream.errors.ts` — `MediaStreamError` hierarchy (`InvalidRequestError` 400, `CircuitBreakerOpenError` 503, `TenantFlushIncompleteError` 503, `TenantSuspendedError` 503, `UpstreamResourceTooLargeError` 502, `UnsupportedSourceFormatError` 502, `SvgSanitizationError` 502, `DefaultImageFallbackError` 500) plus the `API/exceptions/*` fetch/store exceptions. Control flow uses `instanceof`, never message matching

### Path Aliases

- `#microservice/*` → `./src/MediaStream/*` (used throughout the codebase)

### Multi-Tenant Routing

| Route type | URL pattern | Source key | tenantSchema |
|---|---|---|---|
| Tenant-scoped | `media/:tenantSchema/uploads/:imagePath+/…` | `UPLOADED_MEDIA` | extracted from URL |
| Static images | `static/images/:image/…` | `STATIC_IMAGES` | always `"public"` |

There is no legacy (pre-multi-tenant) route — Django emits schema-prefixed URLs exclusively, so `media/uploads/…` (no tenant segment) 404s naturally.

**Cache namespace**: keys are stored as `image:{tenantSchema}:{uuid}` in memory and Redis (`imageNamespace()`), which allows SCAN-based per-tenant invalidation via `MultiLayerCacheManager.invalidateNamespace('image:acme')`.

**`VALIDATION_ALLOWED_DOMAINS`**: the built-in default is deployment-neutral (loopback + in-cluster Service names). Public hostnames are deployment data and arrive via this env var; tenant storefront hosts arrive via `TenantDomainsService`.

### Per-Tenant Cache Flush

```
POST /admin/cache/flush-tenant
x-internal-secret: <INTERNAL_ADMIN_SECRET>
Content-Type: application/json

{ "tenantSchema": "acme" }
```

Flushes the tenant on **every replica**. Each replica first re-reads Django's tenant feed (`TenantDomainsService.refresh`): Django sends this flush when a store is suspended or reactivated (after the change commits), so the replica refuses or serves the store's images from then on rather than from its next poll, and nothing it clears can be refilled for a suspended store. The replica that takes the request (`TenantFlushService`) then clears its own tiers bottom-up — the tenant's objects in the rendition store (`RenditionStoreService.deleteTenant`: list the `acme/` prefix, delete in batches of 1000; attempted even while the store's breaker is open), then `image:acme:*` in Redis, then in its memory tier (`MultiLayerCacheManager.invalidateNamespace(namespace, layer)`) — and publishes the tenant on the Redis channel `mediastream:tenant-flush:{REDIS_DB}`; every other replica clears itself the same way. Bottom-up because a tier can only be refilled from the tiers below it (memory from Redis, both from the store), so a request arriving mid-flush cannot copy a stale entry into a tier that is already done. The memory tier is private to a pod, so without the broadcast a flush sent to one pod left the others serving the old image for up to the memory TTL (30 days in production). Returns `{ flushed: true, tenantSchema, namespace, broadcastReceivers, timestamp }`; `broadcastReceivers` is the number of subscribers that got the message, the origin included, so a healthy flush reports the replica count (pub/sub is fire-and-forget: a replica that is down or mid-reconnect at that moment misses it). A tier that could not be cleared — Redis unreachable (`RedisCacheLayer.deleteByPrefix` throws while disconnected), a store sweep that could not list the prefix or delete an object of the tenant (`deleteTenant` returns `complete: false`), or a sweep that threw — answers 503 `TENANT_FLUSH_INCOMPLETE` after the remaining tiers and the broadcast (so does a tenant feed it could not re-read), so Django's flush task retries. The flush drops cached copies only: the originals stay on `static-svc`, so a request for a known URL is fetched and cached again. `tenantSchema` must match `/^[a-z_][a-z0-9_]{0,62}$/`; the endpoint is fail-closed without `INTERNAL_ADMIN_SECRET`.

**Requests during a flush and the flush epoch.** `TenantCacheEpochs` is an in-process counter per tenant; a flush advances it **before each tier** it clears (the origin and each peer alike). `CacheImageResourceOperation.setup()` records it in `ctx.flushEpoch`. Every write that can put an entry back is fenced: `persist()` (layered set) and the store write after it, the store-hit backfill in `checkResourceExists()`, and the Redis→memory backfill inside `MultiLayerCacheManager.lookup()` (the operation passes `() => flushedSince(ctx)` as `isStale`). Each is skipped when the epoch already moved and removes itself when it moves during the write. Together with the bottom-up order this means no write of data read before a tier was cleared survives that clear; a request that was already running still answers with its own result. `ImageStreamService` puts the epoch in the request-deduplicator key (`{epoch}:{id}`), so a request that starts after a flush never joins work that began before it; because two requests for one id can then run at once, every request names its own download temp file (`ctx.tempToken`: `{id}.{token}.rst`). If an old request discards its copy after a newer-epoch request cached the same id, the newer copy goes with it: one extra cache miss, never stale data. The negative cache (5 min) is not fenced.

### Image Sources

Defined in `src/MediaStream/API/config/image-sources.config.ts`. Each source maps a route pattern to an upstream URL pattern (`{baseUrl}` = `backend.url`). Route params: imagePath/image, width, height, fit, position, background, trimThreshold, quality, format — every segment is mandatory.

### Multi-Layer Cache

Two registered layers, checked in priority order: Memory (node-cache, priority 1) then Redis (ioredis, priority 2). First hit wins and is backfilled into the faster layer, capped at the source's remaining TTL. Behind them is the **rendition store** (`RenditionStoreService`), not a cache layer: one object per rendition, `{tenant}/{id}`, in an S3-compatible bucket (Cloudflare R2 in the cluster) that every replica shares, holding the image envelope. `CacheImageResourceOperation` reads it after the layered lookup and writes it after processing. It is built to never hold up a request: every call has a deadline (`RENDITION_STORE_READ_TIMEOUT_MS` 1 s, `RENDITION_STORE_WRITE_TIMEOUT_MS` 5 s; an abort signal plus a race against it), the SDK does not retry, and five failures in a row open a breaker for 30 s. A read that fails is a miss, so the request is processed; a write that fails leaves the image uncached. The store write is not awaited by the response (`ctx.stored`, which pre-generation awaits). Socket I/O does not use libuv's thread pool, so a store that hangs cannot starve Sharp. With no endpoint or bucket the store is off and only Memory and Redis remain (development). The bucket expires objects with a lifecycle rule (set on the bucket, not by the service). Cache TTLs: public 360 days, private 180 days, negative cache 5 min. Image entries are written with `CACHE_IMAGE_PRIVATE_TTL` (180 days by default) in Redis, memory and the metadata expiry; `REDIS_TTL` and `CACHE_MEMORY_DEFAULT_TTL` are only the defaults for a write that passes no TTL, so they do not shorten image entries (production Redis image keys sit at ~180 days). Redis and the store hold images in one binary envelope (`Cache/utils/image-envelope.util.ts`: `0x00`, metadata length, metadata JSON, raw bytes), read back as a subarray view. `RedisCacheService.clear()` deletes `image:*` via SCAN, never `FLUSHDB` — the database also holds rate-limit counters and circuit-breaker state.

`MultiLayerCacheManager` is the only recorder of `mediastream_cache_operations_total` for the layered tier (one sample per layer probed); the rendition store records its own calls in `mediastream_rendition_store_operations_total{operation,result}`.

There is no access counting and no cache warming: they read and ranked the on-disk pairs, which the store replaced. The memory tier fills on demand (a store hit is one GET) and the bucket's lifecycle rule, not the service, expires objects.

### Processing Pipeline

- **Pre-generation** (`docs/renditions.md`): the cron renders the renditions an upload is shown at (learned from the renditions the service makes: a Redis hash counting, per folder, the sources each was made for) before anyone asks, as background work: `runAsBackground` admits a pipeline only when no request holds or awaits a slot and otherwise throws `BackgroundYieldError` (a `ProcessingOverloadedError` that is neither a shed nor an error). Level-triggered over the read-only media volume and the store, so no queue and no event to lose
- **No job queue**: every request is processed synchronously through `CacheImageResourceOperation.execute()`; concurrent requests for the same resource share one processing via `RequestDeduplicator`
- **Admission control**: every Sharp pipeline runs through `ProcessingAdmissionService` (`PROCESSING_MAX_CONCURRENT`, 0 = ceil of `PROCESSING_CPU_CORES`; `PROCESSING_MAX_QUEUE`; `PROCESSING_QUEUE_TIMEOUT_MS`). Beyond the queue or the wait budget the request gets `ProcessingOverloadedError` (503 + `Retry-After`), and `ImageStreamService` propagates it instead of serving the default image. `PROCESSING_TIMEOUT_SECONDS` is Sharp's per-pipeline `timeout()`; exceeding it is `ProcessingTimeoutError` (503). Occupancy is `mediastream_processing_pipelines{state}`, sheds are `mediastream_processing_rejected_total{reason}`
- **Output format** is always explicit in the URL (`:quality.:format`); there is no Accept-header negotiation and no `Vary` header. `format=svg` produces PNG bytes (`outputFormat()`)
- **Sharp config**: concurrency derived from `PROCESSING_CPU_CORES` (fractions allowed), 100 MB memory cache, SIMD enabled, applied at boot by `Processing/services/sharp-config.service.ts`. Encoder tunables live in `common/constants/image-encoding.constant.ts`: AVIF at effort 3 / 4:4:4 (effort 4 costs 4-8x the encode time for 2-3 % smaller files). AVIF quality is capped at `PROCESSING_AVIF_MAX_QUALITY` (default 55: SSIMULACRA2 of the production pipeline's output against a lossless resize, measured 2026-11-01 on 11 image/width pairs of webside originals with a Python port of SSIMULACRA2 (`ssymulacra2`, not libjxl's tool): worst image 79.8 at q60, 75.0 at q55, 72.1 at q50, 66.4 at q45, against the bar of 72; q50 clears it by 0.1, so 55 keeps about 3 points of headroom and is 14-17 % smaller than 60 on photos); the controller maps the request to its rendition preset (`buildResizeOptions` -> `toRendition`, below) before it is hashed, which includes this clamp, so `/80.avif` and `/100.avif` share one entry and changing the ceiling re-keys AVIF only, with no `PROCESSING_VERSION` bump, the main resize never enlarges but keeps the requested aspect (`boxWithinSource` shrinks the box, `withoutEnlargement` is the backstop; a single requested axis is clamped to the source, because Sharp's `contain` pads that axis out to the request otherwise), and a light sharpen (sigma 0.5) follows any reduction above 2x. `PROCESSING_VERSION` in that file is part of the cache identity: bump it with any change to the produced bytes so the old output is a cache miss rather than served for the 360-day TTL
- **Rendition presets** (`common/constants/rendition-presets.constant.ts`, `common/utils/rendition.util.ts`, `Cache/services/rendition-size.service.ts`): the service stores and encodes a finite set of renditions, not whatever the URL says. Before the request is hashed, `toRendition` answers a **known size** exactly and snaps any other size up: the width to `RENDITION_WIDTHS` (29 steps, 64 to 2048 px, a step is 11-17 % wide from 192 px up), the height following the snapped width at the requested aspect ratio. Known sizes are **learned**, not listed: `RenditionSizeService` counts, in a Redis hash, each time a size is rendered for an upload (a first rendering, so the count is of uploads), promotes it at `RENDITION_SIZES_MIN_SOURCES` (10) into a Redis sorted set scored by when it was last asked for, keeps it while it is asked for within `RENDITION_SIZES_WINDOW_DAYS` (30), and holds at most `RENDITION_SIZES_MAX_KNOWN` (300), the least recently asked leaving first; a prober can hold at most that many sizes exact, each rendered for ten uploads. Requests never wait for Redis: each pod reads the set into memory every minute (`isKnown` is synchronous), reports the sizes it served every 30 s, and keeps the last set when Redis cannot be reached (a size that moved to another rendition would only cause misses); a pod that never had one, with Redis down, snaps everything and never errors. An empty set is seeded once from `SEED_RENDITION_SIZES` (the 2026-10 log-derived list, a seed and not the source of truth), so a first deploy starts at about +1 % pixels. `0x0`, a width past the cap and a size past the pixel budget never become known. Both axes 0 (the original size) and anything wider than 2048 are capped at 2048; a non-AVIF quality in `RENDITION_QUALITIES` (75/80/85/90/100) is kept and any other rounds up; `centre` and the fits that ignore the position (`inside`/`outside`/`fill`) share one position; the AVIF ceiling applies. A rendition is never smaller than requested, a URL is never refused for its size, and a preset maps to itself, so a stored URL (TinyMCE content bakes the sizes in) keeps working. A size is promoted a few seconds after its tenth rendering and answered exactly from then on (one extra rendering per source at the switch). `fit`, `background`, `trimThreshold` and the qualities are not learned.
- **Trim** (`trimThreshold` > 0) never runs on the full-resolution source: Sharp disables shrink-on-load for any trim, so the job shrinks to a working copy first (`TRIM_WORKING_SIZE`, or twice the target) and trims that. A threshold of 0 skips trim entirely; the storefront sends 0 by default
- **Memory**: the production image preloads jemalloc and sets `MALLOC_ARENA_MAX=2` (libvips allocates through GLib and fragments glibc arenas); the Node heap is capped at 512 MB because image bytes live outside it
- **Image limits**: max 8192×8192, max 7680×4320 total pixels (`common/constants/image-limits.constant.ts`); upstream file sizes in `MAX_FILE_SIZES`, keyed on the **sniffed** format, never the URL extension (JPEG 5 MB, PNG 8 MB, WebP 3 MB, GIF 2 MB, TIFF and AVIF 10 MB, SVG 1 MB), enforced on the declared Content-Length and again while streaming, before any decoder runs; `SHARP_INPUT_PIXEL_LIMIT` on every Sharp input

### Additional Endpoints

- `GET /metrics` — Prometheus-format metrics (`Authorization: Bearer <METRICS_BEARER_TOKEN>` required, checked by `MetricsTokenGuard`; also rate-limited as defence in depth). The token is deliberately NOT `INTERNAL_ADMIN_SECRET`: the scraper gets a read-only credential that cannot flush caches or reset the circuit breaker. vmagent scrapes it via a `VMPodScrape` in `grooveshop-infrastructure`

### Health Endpoints

`GET /health` (full), `/health/detailed` (system info, internal IPs only), `/health/ready` (memory + Sharp only; never external dependencies), `/health/live` (heap against V8's `heap_size_limit`), `/health/dependencies` (external deps, internal IPs only), `/health/circuit-breaker`, `POST /health/circuit-breaker/reset` (`x-internal-secret`).

**Indicators must never throw.** Terminus 12 removed `HealthCheckError` and rethrows anything an indicator rejects with, which escapes as a 500 with no body. `BaseHealthIndicator.isHealthy()` therefore catches and *returns* a `down` result; only a returned `down` makes `HealthCheckService` answer 503. Subclasses implement `performHealthCheck()` and may throw freely.

### Security

- `ResourceValidationService`: http(s) only, hostname must be in `validation.allowedDomains` or the dynamic tenant-domain set; per-format size caps
- `SecurityCheckerService`: XSS, SQL injection, path traversal (single and double percent-decoding, malformed encoding rejected), command injection, XXE, NoSQL patterns; entropy-based payload detection (image filenames exempt)
- `AdaptiveRateLimitGuard`: health probes (except `POST /health/circuit-breaker/reset`) and static assets under `public/` bypass; bot User-Agents bypass only from internal IPs (`common/utils/ip.util.ts`); Referer/Origin whitelist only for internal-IP callers. Image processing is keyed per tenant + IP; the limit shrinks under heap pressure measured against V8's `heap_size_limit`
- `HttpClientService`: `maxRedirects: 0` (a redirect could pivot to an internal host), retry with exponential backoff, circuit breaker persisted to Redis; only 5xx/network faults count as upstream failures (a 404 is an answer, not an outage)
- `InternalSecretGuard`: constant-time comparison of `x-internal-secret` against `admin.secret` (`INTERNAL_ADMIN_SECRET`); fail-closed when empty. Guards the admin endpoints only
- `MetricsTokenGuard`: constant-time comparison of the `Authorization: Bearer` value against `monitoring.metricsToken` (`METRICS_BEARER_TOKEN`); fail-closed when empty. Both guards share `common/utils/secret-compare.util.ts`

### Request Context & Observability

- **Production logs are JSON**: `main.ts` hands Nest a `ConsoleLogger({ json: isProduction(), flattenParams: true })`, one object per line with `level` (`log`/`warn`/`error`/`debug`/`verbose`/`fatal`), `context`, `message` and, on errors, `stack`; a structured event's fields sit at the top level beside them. Vector parses it into `log.*`, which is what the log alerts and Grafana level mapping key on. Outside production the colourised text format stays
- **One line per image request**: `API/middleware/image-request-log.middleware.ts` emits it (context `ImageRequest`, snake_case fields) when the response closes, whatever answered: pipeline, guard, validation, router or filter. The pipeline fills the record through `currentImageRequest()` (`Correlation/utils/image-request-log.util.ts`); `outcome=rejected` (size, format, sanitiser fail-closed) is logged at WARN, everything else at info. Field list, metrics and LogsQL/PromQL examples: `docs/observability.md`
- **AsyncLocalStorage** propagates correlation IDs across async boundaries. `CorrelatedLogger` prefixes every line with the id
- **Logging convention**: request-path classes (API, Processing jobs, Validation, RateLimit, Cache, Health indicators, middleware) log via the static `CorrelatedLogger`; boot-time/interval-only classes (`ConfigService`, `SharpConfigService`, `MetricsService`, graceful shutdown, `main.ts`) use the plain Nest `Logger`. The logger's second argument is the context *string* (or the stack trace for `error`); put data in the message, except for a structured event (`CorrelatedLogger.event(level, message, fields, context)`), whose fields become `log.<field>`
- **Middleware order**: shutdown check (503 while draining) → Correlation ID (`x-correlation-id`, set once, never re-set by services) → Timing headers (`x-response-time`, `x-request-start`, `x-request-end`) → Metrics collection → (image route only) the image request log
- **Metric labels are closed sets.** `route` is the registered route pattern (`req.route.path`, e.g. `/media_stream-image/*path`), or `unmatched` when no route matched; nothing a client sends becomes a label value. There is no `tenant_schema` label: the schema segment is client-chosen, so per-tenant numbers come from the `schema` field of the image request log
- **Global exception filter**: every error becomes the same JSON envelope with `correlationId`; 5xx logged at error, 4xx and capacity sheds at warn. It is the only place a thrown error is logged: the controller adds no line of its own. An upstream 4xx is logged at warn by `FetchResourceResponseJob` (5xx at error), and the default image served for it adds no ERROR line
- **Performance tracking**: `PerformanceTracker.startPhase()/endPhase()` per request; slow phases (>1 s) warn, the per-request summary is a debug line

### Graceful Shutdown

Two-tier timeout: soft (`SHUTDOWN_TIMEOUT`, 30 s) waits for in-flight requests, force (`SHUTDOWN_FORCE_TIMEOUT`, 60 s) calls `process.exit(1)`. New requests get 503 while draining; `/health/ready` fails, `/health/live` keeps passing so kubelet does not race the shutdown. Signal handlers for SIGTERM and SIGINT.

### Utility Scripts

- `scripts/clear-cache.cjs` — Clears Redis + file system cache (`--redis-only`, `--files-only`, `REDIS_*`/`CACHE_FILE_DIRECTORY` env or CLI flags)

### Key Environment Variables

Copy `.env.example` to `.env`. Critical ones: `PORT` (default 3003), `BACKEND_URL` (upstream image server; required in production), `REDIS_HOST`/`REDIS_PORT`, `INTERNAL_ADMIN_SECRET`, `METRICS_BEARER_TOKEN`, `RENDITION_STORE_*`. Every env var maps to a key in `APP_CONFIG_SCHEMA` — `.env.example` mirrors the schema 1:1 — except `NODE_ENV` and `LOG_LEVEL`, which are read directly from the environment (`LOG_LEVEL` configures the Nest logger before any provider exists). `cron` is a direct dependency because `SchedulerRegistry.addCronJob()` uses `CronJob` from it directly.

## Code Style

- `@antfu/eslint-config` with **tabs** and **single quotes**; `eslint .` lints TS/JS only (JSON/YAML/Markdown formatters are off)
- ESM modules (`"type": "module"`), SWC builds (`nest-cli.json`), Vitest with `unplugin-swc`
- Unit tests in `src/test/` as `*.spec.ts`, E2E in `src/test/e2e/` as `*.e2e-spec.ts`, performance specs in `src/test/performance/` (own config). `src/test/helpers/config-service.mock.ts` provides `createConfigServiceMock(overrides)` — a `ConfigService` double with every schema default; config is read in constructors, so build a new instance per configuration under test
- Prefer fake timers (`vi.useFakeTimers`) over real sleeps and `vi.stubEnv` over `process.env` writes
- Node.js per `engines` in `package.json`, pnpm package manager (`packageManager` field)
