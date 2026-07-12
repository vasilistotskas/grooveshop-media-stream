# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS microservice for image processing and streaming, part of the Grooveshop platform. Fetches images from a backend service, resizes/converts them using Sharp, caches results across multiple layers, and streams them to clients.

## Commands

```bash
pnpm install              # Install dependencies
pnpm run dev              # Development with watch mode (nest start --tsc --watch)
pnpm run build            # Production build (SWC compiler via nest-cli)
pnpm run prod             # Run production build (node build/dist/main.js)
pnpm run lint             # ESLint with auto-fix
pnpm run type-check       # Two tsc passes: src (strict) + specs (tsconfig.spec.json)
pnpm run test             # Run all unit tests (vitest; coverage thresholds enforced)
pnpm run test:e2e         # Run E2E tests (separate vitest config, no coverage)
pnpm run test:coverage    # Tests with coverage report
pnpm run cache:clear      # Clear application cache
```

Run a single test file: `npx vitest run src/test/Cache/services/memory-cache.service.spec.ts`

## Architecture

### Request Flow

1. **Request** hits `MediaStreamImageController` via catch-all route `GET /media_stream-image/*`
2. Controller matches the URL path against `IMAGE_SOURCES` config patterns (compiled to RegExp at startup)
3. `RequestValidatorService` validates security threats and numeric params (width 1-8192, height 1-8192, quality 1-100, trimThreshold 0-100; width/height of 0 means "use original dimensions")
4. `UrlBuilderService` builds the upstream URL from source config
5. `ImageStreamService` orchestrates: checks cache → conditional requests (ETag/If-Modified-Since for 304s) → request deduplication → fetch & process → stream response. Falls back to `public/default.png` on error.
6. `CacheImageResourceOperation` uses a stateless **OperationContext** pattern for thread-safe concurrent processing. Manages fetch → process → store lifecycle with negative caching (5 min TTL for failed fetches)

### Module System

All source code lives under `src/MediaStream/`. Each domain is a NestJS module:

- **API** — Controllers, DTOs, image source config, request validation, URL building, image streaming
- **Cache** — Multi-layer caching (Memory → Redis → File), cache warming, eviction strategies, `CacheImageResourceOperation` + its collaborators (`ResourceFetcher`, `ImageFormatProcessor`)
- **Config** — Centralized config service wrapping `@nestjs/config`. `APP_CONFIG_SCHEMA` in `common/utils/config-schema.util.ts` is the **single source of truth** for every config key, env-var mapping, and default; DTO validation runs against the built config at startup. Add new config keys to the schema + interface + DTO + `.env.example` together
- **Correlation** — Request correlation IDs, timing middleware, performance tracking
- **Health** — Health check indicators (disk, memory, Sharp, cache, HTTP, storage)
- **HTTP** — HTTP client with circuit breaker pattern
- **Metrics** — Prometheus metrics via prom-client (prefixed `mediastream_`), tracks HTTP requests, image processing, cache ops, system resources
- **Processing** — Stateless Sharp jobs (fetch, store-to-file, identity generation, webp/format manipulation) and `SharpConfigService` (global Sharp concurrency/cache/SIMD tuning applied at boot via `onModuleInit`)
- **RateLimit** — Adaptive rate limiting guard (`RATE_LIMIT_ENABLED=false` is the operator kill-switch)
- **Storage** — File storage management, cleanup, intelligent eviction
- **Validation** — Input sanitization and security threat detection

Scheduled tasks use `@nestjs/schedule`: `SchedulerRegistry.addCronJob()` for config-driven schedules (`CACHE_WARMING_CRON`, `STORAGE_CLEANUP_CRON` take effect at boot) and `@Cron` decorators for the fixed storage monitoring/optimization intervals.

### Path Aliases

- `#microservice/*` → `./src/MediaStream/*` (used throughout the codebase)
- `#storage/*` → `./var/*`

### Image Sources

Defined in `src/MediaStream/API/config/image-sources.config.ts`. Each source maps a route pattern to an upstream URL pattern. Route params include: imagePath, width, height, fit, position, background, trimThreshold, quality, format.

### Multi-Layer Cache

Cache layers checked in parallel: Memory (node-cache, priority 1) → Redis (ioredis, priority 2) → File system (`./storage`, priority 3). Returns first hit from highest-priority layer. Automatic backfill to higher-priority layers on cache hits (fire-and-forget). Cache warming runs every 6 hours for popular images (5+ accesses). Storage files use extensions: `.rsc` (resource data), `.rst` (temp during write), `.rsm` (metadata JSON). Cache TTLs: public 360 days, private 180 days, negative cache 5 min for failed fetches. `RedisCacheService.flushAll()` executes `FLUSHDB` (current database only), not `FLUSHALL` — Redis is shared with Django, Nuxt, and Celery. `ResourceMetaData` includes an `accessCount` field incremented on every cache hit; cache warming uses this for the 5-access threshold and stores `{ data: Buffer, metadata: ResourceMetaData }` shape in both `warmupFile` and `warmupSpecificFile`.

### Processing Pipeline

- **No job queue**: there is no Bull/Redis queue. All images are processed synchronously — `ImageStreamService` calls `CacheImageResourceOperation.execute()` for every request. Both the `image-processing` queue (C13 fix) and the later `cache-operations` queue were removed as dead code: warming and cleanup run via cron in `CacheWarmingService`/`StorageCleanupService`, and nothing ever enqueued jobs in production.
- **Operation decomposition**: `CacheImageResourceOperation` orchestrates; `ResourceFetcher` owns negative caching + upstream fetch + streaming size guards; `ImageFormatProcessor` owns SVG detection/sanitization, raster processing, and the default-image fallback (all in `Cache/operations/`).
- **Content negotiation**: Format priority from Accept header: AVIF > WebP > JPEG > PNG. Explicit URL format param overrides.
- **Sharp config**: Concurrency based on CPU cores (`PROCESSING_CPU_CORES`, fractions allowed), 100MB memory cache, SIMD enabled — applied at boot by `Processing/services/sharp-config.service.ts`. AVIF falls back to WebP for images >1920x1080.
- **Image limits**: Max 8192x8192, max 7680×4320 total pixels. Per-format file sizes come from the single `MAX_FILE_SIZES` constant (`common/constants/image-limits.constant.ts`): JPEG 5MB, PNG 8MB, WebP 3MB, GIF 2MB, SVG 1MB, default 10MB. `limitInputPixels: 268402689` is applied to ALL Sharp pipeline inputs to prevent oversized-image DoS.

### Additional Endpoints

- `GET /config/image-sources` — Returns image source configuration, enums (fit, position, background, format), and defaults
- `GET /metrics` — Prometheus-format metrics, `GET /metrics/health` — Metrics service health

### Health Endpoints

`GET /health` (full), `/health/detailed` (system info, internal IPs only), `/health/ready` (lightweight), `/health/live` (liveness), `/health/dependencies` (external deps), `/health/circuit-breaker` (status), `POST /health/circuit-breaker/reset`. Health indicators: disk space, memory, Sharp, cache, Redis, HTTP, storage.

### Security

- `InputSanitizationService`: URL domain whitelist (configurable via `validation.allowedDomains`), XSS/HTML sanitization with multi-pass stripping
- `SecurityCheckerService`: Detects XSS, SQL injection, path traversal, command injection, XXE, NoSQL injection patterns; entropy-based payload detection
- `AdaptiveRateLimitGuard`: Skips in dev mode; `RATE_LIMIT_ENABLED=false` disables limiting entirely; health checks and static assets bypass via `RATE_LIMIT_BYPASS_*` flags (default on). `/metrics` is deliberately NOT exempt (defence-in-depth alongside `InternalSecretGuard`). Bot User-Agent bypass requires `isInternalIp()` (shared `common/utils/ip.util.ts`) — external clients cannot bypass rate limiting by spoofing bot headers. Keys on IP + user-agent + request type. The adaptive limit shrinks under heap pressure measured against V8's `heap_size_limit`
- `SecurityCheckerService` path traversal detection uses multi-decode: single decode, double decode, and malformed encoding rejection
- `HttpClientService`: Circuit breaker pattern with state persisted to Redis, retry with exponential backoff

### Request Context & Observability

- **AsyncLocalStorage** propagates correlation IDs across async boundaries without explicit parameter passing. `CorrelatedLogger` auto-includes correlation IDs in all log output.
- **Logging convention**: request-path classes (API, Processing jobs, Validation, RateLimit, Cache operations, Storage) log via the static `CorrelatedLogger`; boot-time/interval-only classes (ConfigService, SharpConfigService, MetricsService, graceful-shutdown) use the plain Nest `Logger`. Never pass object literals as the logger's second argument — it is the context *string* slot; put data in the message.
- **Middleware order**: Graceful shutdown check (503 if shutting down) → Correlation ID (`x-correlation-id`) → Timing headers (`x-response-time`, `x-request-start`, `x-request-end`) → Metrics collection
- **Route normalization** in metrics: `/123` → `/:id`, UUID patterns → `/:uuid`, ObjectId → `/:objectId` to prevent cardinality explosion
- **Global exception filter**: All errors enriched with correlationId, consistent JSON structure with timestamp/path/method/context
- **Performance tracking**: `PerformanceTracker.startPhase()/endPhase()` for request-phase timing, slow operation warnings (>1000ms)

### Graceful Shutdown

Two-tier timeout: soft (30s) waits for active requests, force (60s) calls `process.exit(1)`. New requests get 503 during shutdown. Active request tracking via WeakSet to prevent double-counting. Signal handlers for SIGTERM and SIGINT.

### Storage Eviction & Optimization

Five eviction strategies: LRU, LFU, size-based, age-based, and **intelligent** (combines access patterns, preserves files with 5+ accesses). Configurable aggressiveness: conservative (0.8x), moderate (1.0x), aggressive (1.5x). Access-weighted cache TTL: `baseTtl × (1 + min(accessCount/10, 5))` — popular files get up to 6x longer lifetime. Default retention policies: old cache files (30d), large images (7d, 100MB max), temp files (1d). Storage optimization (compression, deduplication via MD5 hard-linking) runs every 6 hours. `StorageCleanupService` runs daily at 2 AM with dry-run support.

### Utility Scripts

- `scripts/clear-cache.cjs` — Clears Redis + file system cache (supports `--redis-only`, `--files-only`, custom host/port)
- `scripts/inject-version.cjs` — Injects `package.json` version into `public/index.html` (runs as `prebuild`)

### Key Environment Variables

Copy `.env.example` to `.env`. Critical ones: `PORT` (default 3003), `BACKEND_URL` (upstream image server), `REDIS_HOST`/`REDIS_PORT` (required for cache), `CACHE_WARMING_CRON` (cache warming schedule), `STORAGE_CLEANUP_CRON` (storage cleanup schedule). Every env var maps to a key in `APP_CONFIG_SCHEMA` (`common/utils/config-schema.util.ts`) — `.env.example` mirrors the schema 1:1. `cron` is a direct dependency (not just transitive via `@nestjs/schedule`) because `SchedulerRegistry.addCronJob()` uses `CronJob` from it directly.

## Code Style

- Uses `@antfu/eslint-config` with **tabs** for indentation, **single quotes**
- ESM modules (`"type": "module"` in package.json)
- SWC compiler for builds (configured in `nest-cli.json`)
- Vitest for testing with SWC plugin (`unplugin-swc`)
- Unit tests in `src/test/` as `*.spec.ts`, E2E tests in `src/test/e2e/` as `*.e2e-spec.ts`
- Tests require Redis running locally (CI uses Redis 8 Alpine)
- Node.js >= 24.12.0, pnpm package manager
