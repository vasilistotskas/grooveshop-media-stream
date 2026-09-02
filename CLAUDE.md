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

Run a single test file: `pnpm exec vitest run src/test/Cache/services/memory-cache.service.spec.ts --no-coverage`. Use `pnpm exec`, never `npx`. Tests require Redis running locally (CI uses Redis 8 Alpine).

## Architecture

### Request Flow

1. **Request** hits `MediaStreamImageController` via catch-all route `GET /media_stream-image/*`
2. Controller percent-decodes the path (`decodePathFully`, up to 3 passes) and matches it against `IMAGE_SOURCES` patterns (compiled to RegExp at startup)
3. `RequestValidatorService` validates every string param with `SecurityCheckerService`, the tenant schema pattern, the enum params (fit/position/format), numeric ranges (width/height 0–8192, quality 1–100, trimThreshold 0–100; 0 means "use original dimensions") and the total-pixel budget (7680×4320). Everything here is a **400**; the pipeline downstream assumes clean input
4. `UrlBuilderService` builds the upstream URL from `backend.url` + the source pattern; `ResourceValidationService.validateUrl` enforces http(s) and the host allowlist (SSRF guard)
5. `ImageStreamService` orchestrates: one layered cache lookup → conditional requests (ETag/If-Modified-Since → 304) → request deduplication per resource id → fetch & process → `res.end(buffer)`. Anything that fails inside it serves `public/default.png` (processed to the requested format); only `DefaultImageFallbackError` propagates
6. `CacheImageResourceOperation` uses a stateless **OperationContext** (`request`, `id`, `metaData`, `cached`) so concurrent requests never share state. `ResourceFetcher` owns negative caching (5 min TTL) + the streamed download with a per-format size guard; `ImageFormatProcessor` owns SVG detection/sanitisation, raster processing and the default-image fallback; `AccessCountTracker` batches `accessCount` increments to the on-disk `.rsm` sidecars

### Module System

All source code lives under `src/MediaStream/`. Each domain is a NestJS module:

- **API** — Controller, DTOs (`ResizeOptions`, `CacheImageRequest`, `RESIZE_DEFAULTS`), image source config, request validation, URL building, image streaming
- **Cache** — Memory → Redis layers behind `MultiLayerCacheManager`, cache warming, `CacheImageResourceOperation` + collaborators (`ResourceFetcher`, `ImageFormatProcessor`, `AccessCountTracker`), cache-namespace helper, admin flush endpoint
- **Config** — `ConfigService.get(key)` over the schema-built config. `APP_CONFIG_SCHEMA` in `common/utils/config-schema.util.ts` is the **single source of truth** for every key, env-var mapping and default; the DTOs in `Config/dto/` carry constraints only (no defaults) and are validated at startup as a completeness check. There is no `getOptional`: an unknown key is a programming error. Add a key to the schema + interface + DTO + `.env.example` together
- **Correlation** — Request correlation IDs (AsyncLocalStorage), timing middleware, per-request performance phases
- **Health** — Health indicators (disk, memory, Sharp, cache, Redis, HTTP, storage, tenant domains); thresholds are code constants
- **HTTP** — HTTP client with retry and a Redis-persisted circuit breaker
- **Metrics** — Prometheus metrics via prom-client (prefixed `mediastream_`)
- **Processing** — Stateless Sharp jobs (fetch, identity generation, format manipulation) and `SharpConfigService` (global Sharp concurrency/cache/SIMD applied at boot)
- **RateLimit** — `AdaptiveRateLimitGuard` (`CanActivate`) over `RateLimitService`: a Redis Lua counter (EVALSHA via `defineCommand`) with an in-memory fallback. `RATE_LIMIT_ENABLED=false` is the only kill-switch; there is no development-mode skip
- **Storage** — On-disk cache inventory (`.rsc`/`.rsm` pairs) and the nightly cleanup: TTL expiry, stale temp/orphan sweep, score-based eviction to the warning thresholds
- **Validation** — `SecurityCheckerService` (injection/traversal/encoded-payload detection on strings), `ResourceValidationService` (URL allowlist, per-format size caps), `TenantDomainsService` (dynamic tenant-domain allowlist polled from Django)

Scheduled tasks use `@nestjs/schedule`'s `SchedulerRegistry.addCronJob()` with config-driven schedules (`CACHE_WARMING_CRON`, `STORAGE_CLEANUP_CRON`, read at boot). There are no `@Cron` decorators.

### Shared helpers (`common/`)

- `utils/error-message.util.ts` — `errorMessage(err)`; never `(err as Error).message` on a caught value
- `utils/runtime-env.util.ts` — `nodeEnv()/isProduction()/isTest()`; the only reader of `NODE_ENV`
- `utils/storage-path.util.ts` — `storageDirectory(configService)`; every class that touches `storage/` resolves the directory here
- `utils/percent-decode.util.ts`, `utils/bytes.util.ts`, `utils/ip.util.ts`, `utils/tenant-path.util.ts`, `utils/etag.util.ts`
- `Cache/utils/cache-namespace.util.ts` — `imageNamespace(tenant)`, `cacheKey`, `tenantFromNamespace`, `IMAGE_KEY_PATTERN`
- `errors/media-stream.errors.ts` — `MediaStreamError` hierarchy (`InvalidRequestError` 400, `CircuitBreakerOpenError` 503, `UpstreamResourceTooLargeError` 502, `DefaultImageFallbackError` 500) plus the `API/exceptions/*` fetch/store exceptions. Control flow uses `instanceof`, never message matching

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

Invalidates all `image:acme:*` entries in memory and Redis and sweeps the on-disk tier (`StorageCleanupService.removeTenantFiles`) for `.rsm`/`.rsc` pairs whose `tenantSchema` matches. Returns `{ flushed: true, tenantSchema, namespace, timestamp }`. `tenantSchema` must match `/^[a-z_][a-z0-9_]{0,62}$/`; the endpoint is fail-closed without `INTERNAL_ADMIN_SECRET`.

### Image Sources

Defined in `src/MediaStream/API/config/image-sources.config.ts`. Each source maps a route pattern to an upstream URL pattern (`{baseUrl}` = `backend.url`). Route params: imagePath/image, width, height, fit, position, background, trimThreshold, quality, format — every segment is mandatory.

### Multi-Layer Cache

Two registered layers, checked in priority order: Memory (node-cache, priority 1) then Redis (ioredis, priority 2). First hit wins and is backfilled into the faster layer, capped at the source's remaining TTL. The on-disk tier (`storage/{uuid}.rsc` + `{uuid}.rsm`) is not a cache layer; `CacheImageResourceOperation` reads and writes it directly and atomically (`.tmp` + rename). Cache TTLs: public 360 days, private 180 days, negative cache 5 min. Redis entries are written as a binary envelope (`0x00`, metadata length, metadata JSON, raw bytes) and read back as a subarray view. `RedisCacheService.clear()` deletes `image:*` via SCAN, never `FLUSHDB` — the database also holds rate-limit counters and circuit-breaker state.

`MultiLayerCacheManager` is the only recorder of `mediastream_cache_operations_total` for the layered tier (one sample per layer probed); the operation records the filesystem tier once per request.

**Access counting and warming**: every served request bumps the `.rsm` `accessCount` through `AccessCountTracker` (batched, flushed every 30 s / at 1000 pending / on shutdown). `CacheWarmingService` runs on `CACHE_WARMING_CRON` and preloads files with 5+ accesses into memory/Redis with an access-weighted TTL: `baseTtl × (1 + min(accessCount/10, 5))`.

### Processing Pipeline

- **No job queue**: every request is processed synchronously through `CacheImageResourceOperation.execute()`; concurrent requests for the same resource share one processing via `RequestDeduplicator`
- **Output format** is always explicit in the URL (`:quality.:format`); there is no Accept-header negotiation and no `Vary` header. `format=svg` produces PNG bytes (`outputFormat()`)
- **Sharp config**: concurrency derived from `PROCESSING_CPU_CORES` (fractions allowed), 100 MB memory cache, SIMD enabled, applied at boot by `Processing/services/sharp-config.service.ts`. AVIF falls back to WebP above 1920×1080
- **Image limits**: max 8192×8192, max 7680×4320 total pixels (`common/constants/image-limits.constant.ts`); per-format upstream file sizes in `MAX_FILE_SIZES` (JPEG 5 MB, PNG 8 MB, WebP 3 MB, GIF 2 MB, SVG 1 MB, default 10 MB), enforced on the declared Content-Length and again while streaming; `SHARP_INPUT_PIXEL_LIMIT` on every Sharp input

### Additional Endpoints

- `GET /metrics` — Prometheus-format metrics (`x-internal-secret` required; also rate-limited as defence in depth)

### Health Endpoints

`GET /health` (full), `/health/detailed` (system info, internal IPs only), `/health/ready` (memory + Sharp only; never external dependencies), `/health/live` (heap against V8's `heap_size_limit`), `/health/dependencies` (external deps, internal IPs only), `/health/circuit-breaker`, `POST /health/circuit-breaker/reset` (`x-internal-secret`).

**Indicators must never throw.** Terminus 12 removed `HealthCheckError` and rethrows anything an indicator rejects with, which escapes as a 500 with no body. `BaseHealthIndicator.isHealthy()` therefore catches and *returns* a `down` result; only a returned `down` makes `HealthCheckService` answer 503. Subclasses implement `performHealthCheck()` and may throw freely.

### Security

- `ResourceValidationService`: http(s) only, hostname must be in `validation.allowedDomains` or the dynamic tenant-domain set; per-format size caps
- `SecurityCheckerService`: XSS, SQL injection, path traversal (single and double percent-decoding, malformed encoding rejected), command injection, XXE, NoSQL patterns; entropy-based payload detection (image filenames exempt)
- `AdaptiveRateLimitGuard`: health probes (except `POST /health/circuit-breaker/reset`) and static assets under `public/` bypass; bot User-Agents bypass only from internal IPs (`common/utils/ip.util.ts`); Referer/Origin whitelist only for internal-IP callers. Image processing is keyed per tenant + IP; the limit shrinks under heap pressure measured against V8's `heap_size_limit`
- `HttpClientService`: `maxRedirects: 0` (a redirect could pivot to an internal host), retry with exponential backoff, circuit breaker persisted to Redis; only 5xx/network faults count as upstream failures (a 404 is an answer, not an outage)
- `InternalSecretGuard`: constant-time comparison of `x-internal-secret` against `admin.secret` (`INTERNAL_ADMIN_SECRET`); fail-closed when empty

### Request Context & Observability

- **AsyncLocalStorage** propagates correlation IDs across async boundaries. `CorrelatedLogger` prefixes every line with the id
- **Logging convention**: request-path classes (API, Processing jobs, Validation, RateLimit, Cache, Storage, Health indicators, middleware) log via the static `CorrelatedLogger`; boot-time/interval-only classes (`ConfigService`, `SharpConfigService`, `MetricsService`, graceful shutdown, `main.ts`) use the plain Nest `Logger`. The logger's second argument is the context *string* (or the stack trace for `error`); put data in the message
- **Middleware order**: shutdown check (503 while draining) → Correlation ID (`x-correlation-id`, set once, never re-set by services) → Timing headers (`x-response-time`, `x-request-start`, `x-request-end`) → Metrics collection
- **Route normalisation** in metrics: numeric ids → `/:id`, UUIDs → `/:uuid`, ObjectIds → `/:objectId`, capped at 5 segments
- **Global exception filter**: every error becomes the same JSON envelope with `correlationId`; 5xx logged at error, 4xx at warn
- **Performance tracking**: `PerformanceTracker.startPhase()/endPhase()` per request; slow phases (>1 s) warn, the per-request summary is a debug line

### Graceful Shutdown

Two-tier timeout: soft (`SHUTDOWN_TIMEOUT`, 30 s) waits for in-flight requests, force (`SHUTDOWN_FORCE_TIMEOUT`, 60 s) calls `process.exit(1)`. New requests get 503 while draining; `/health/ready` fails, `/health/live` keeps passing so kubelet does not race the shutdown. Signal handlers for SIGTERM and SIGINT.

### Storage cleanup

`StorageMonitoringService` scans `CACHE_FILE_DIRECTORY` once (snapshot cached 30 s) and groups `{uuid}.rsc` + `{uuid}.rsm` pairs, reading `dateCreated`, `privateTTL`, `accessCount` and `tenantSchema` from the sidecar; anything else (`.rst`, `.tmp`, unpaired halves, unparsable sidecars) is an orphan. `StorageCleanupService` runs on `STORAGE_CLEANUP_CRON` (default 02:00): (1) removes pairs whose `dateCreated + privateTTL` has passed, (2) removes orphans older than 1 h, (3) if the directory is above `STORAGE_WARNING_SIZE`/`STORAGE_WARNING_FILE_COUNT`, evicts pairs highest score first (age, size, low access count) with entries at or above `STORAGE_EVICTION_MIN_ACCESS_COUNT` last, until under both. `STORAGE_CLEANUP_DRY_RUN` reports without deleting; `STORAGE_CLEANUP_MAX_DURATION` bounds a run. `/health` reports storage `down` above the `STORAGE_CRITICAL_*` thresholds.

### Utility Scripts

- `scripts/clear-cache.cjs` — Clears Redis + file system cache (`--redis-only`, `--files-only`, `REDIS_*`/`CACHE_FILE_DIRECTORY` env or CLI flags)

### Key Environment Variables

Copy `.env.example` to `.env`. Critical ones: `PORT` (default 3003), `BACKEND_URL` (upstream image server; required in production), `REDIS_HOST`/`REDIS_PORT`, `INTERNAL_ADMIN_SECRET`, `CACHE_WARMING_CRON`, `STORAGE_CLEANUP_CRON`. Every env var maps to a key in `APP_CONFIG_SCHEMA` — `.env.example` mirrors the schema 1:1 — except `NODE_ENV` and `LOG_LEVEL`, which are read directly from the environment (`LOG_LEVEL` configures the Nest logger before any provider exists). `cron` is a direct dependency because `SchedulerRegistry.addCronJob()` uses `CronJob` from it directly.

## Code Style

- `@antfu/eslint-config` with **tabs** and **single quotes**; `eslint .` lints TS/JS only (JSON/YAML/Markdown formatters are off)
- ESM modules (`"type": "module"`), SWC builds (`nest-cli.json`), Vitest with `unplugin-swc`
- Unit tests in `src/test/` as `*.spec.ts`, E2E in `src/test/e2e/` as `*.e2e-spec.ts`, performance specs in `src/test/performance/` (own config). `src/test/helpers/config-service.mock.ts` provides `createConfigServiceMock(overrides)` — a `ConfigService` double with every schema default; config is read in constructors, so build a new instance per configuration under test
- Prefer fake timers (`vi.useFakeTimers`) over real sleeps and `vi.stubEnv` over `process.env` writes
- Node.js >= 24.12.0, pnpm package manager
