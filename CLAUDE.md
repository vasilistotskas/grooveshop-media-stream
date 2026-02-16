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
pnpm run type-check       # TypeScript type checking (tsc --noEmit)
pnpm run test             # Run all unit tests (vitest)
pnpm run test:e2e         # Run E2E tests (separate vitest config)
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
- **Cache** — Multi-layer caching (Memory → Redis → File), cache warming, eviction strategies
- **Config** — Centralized config service wrapping `@nestjs/config`, schema-based validation
- **Correlation** — Request correlation IDs, timing middleware, performance tracking
- **Health** — Health check indicators (disk, memory, Sharp, cache, HTTP, storage)
- **HTTP** — HTTP client with circuit breaker pattern
- **Metrics** — Prometheus metrics via prom-client (prefixed `mediastream_`), tracks HTTP requests, image processing, cache ops, system resources
- **Monitoring** — System monitoring, alerting, performance tracking
- **Queue** — Bull/Redis job queue for background image processing
- **RateLimit** — Adaptive rate limiting guard
- **Storage** — File storage management, cleanup, intelligent eviction
- **Tasks** — Scheduled tasks via `@nestjs/schedule` (storage cleanup runs daily at 2 AM)
- **Validation** — Request validation rules, input sanitization, security threat detection

### Path Aliases

- `#microservice/*` → `./src/MediaStream/*` (used throughout the codebase)
- `#storage/*` → `./var/*`

### Image Sources

Defined in `src/MediaStream/API/config/image-sources.config.ts`. Each source maps a route pattern to an upstream URL pattern. Route params include: imagePath, width, height, fit, position, background, trimThreshold, quality, format.

### Multi-Layer Cache

Cache layers checked in order: Memory (node-cache) → Redis (ioredis) → File system (`./storage`). Automatic backfill to higher-priority layers on cache hits. Cache warming runs on a cron schedule for popular images. Storage files use extensions: `.rsc` (resource data), `.rst` (temp during write), `.rsm` (metadata JSON).

### Processing Pipeline

- **Two Bull queues**: `image-processing` (download → validate → Sharp → cache → filesystem) and `cache-operations` (warming, cleanup). Default: 3 attempts with exponential backoff.
- **Sync vs background**: Images >1MP or quality >=90 are processed in background queue; smaller images are processed synchronously.
- **Content negotiation**: Format priority from Accept header: AVIF > WebP > JPEG > PNG. Explicit URL format param overrides.
- **Sharp config**: Concurrency based on CPU cores, 100MB memory cache, SIMD enabled. AVIF falls back to WebP for images >1920x1080.
- **Image limits**: Max 8192x8192, max 7680×4320 total pixels. File sizes: JPEG 5MB, PNG 8MB, WebP 3MB, GIF 2MB, SVG 1MB, default 10MB.

### Health Endpoints

`GET /health` (full), `/health/detailed` (system info), `/health/ready` (lightweight), `/health/live` (liveness), `/health/circuit-breaker` (status), `POST /health/circuit-breaker/reset`.

### Security

- `InputSanitizationService`: URL domain whitelist (configurable via `validation.allowedDomains`), XSS/HTML sanitization with multi-pass stripping
- `SecurityCheckerService`: Detects XSS, SQL injection, path traversal, command injection, XXE, NoSQL injection patterns; entropy-based payload detection
- `AdaptiveRateLimitGuard`: Skips in dev mode, bypasses health/metrics/static/whitelisted domains/bots. Keys on IP + user-agent + request type
- `HttpClientService`: Circuit breaker pattern with state persisted to Redis, retry with exponential backoff

### Request Context & Observability

- **AsyncLocalStorage** propagates correlation IDs across async boundaries without explicit parameter passing. `CorrelatedLogger` auto-includes correlation IDs in all log output.
- **Middleware order**: Graceful shutdown check (503 if shutting down) → Correlation ID → Timing headers (`x-response-time`) → Metrics collection
- **Route normalization** in metrics: `/123` → `/:id`, UUID patterns → `/:uuid`, ObjectId → `/:objectId` to prevent cardinality explosion
- **Global exception filter**: All errors enriched with correlationId, consistent JSON structure with timestamp/path/method/context
- **Performance tracking**: `@PerformanceTracker.measureMethod()` decorator for automatic method timing, slow operation warnings (>1000ms)

### Graceful Shutdown

Two-tier timeout: soft (30s) waits for active requests, force (60s) calls `process.exit(1)`. New requests get 503 during shutdown. Active request tracking via middleware counter.

### Storage Eviction & Optimization

Five eviction strategies: LRU, LFU, size-based, age-based, and **intelligent** (combines access patterns, preserves files with 5+ accesses). Access-weighted cache TTL: `baseTtl × (1 + min(accessCount/10, 5))` — popular files get up to 6x longer lifetime. Storage optimization (compression, deduplication via MD5 hard-linking) runs every 6 hours.

### Utility Scripts

- `scripts/analyze-imports.cjs` — Detects internal imports using `#microservice` alias that should use relative paths
- `scripts/fix-imports.cjs` — Auto-converts internal imports to relative paths
- `scripts/clear-cache.cjs` — Clears Redis + file system cache

### Key Environment Variables

Copy `.env.example` to `.env`. Critical ones: `PORT` (default 3003), `BACKEND_URL` (upstream image server), `REDIS_HOST`/`REDIS_PORT` (required for queue and cache).

## Code Style

- Uses `@antfu/eslint-config` with **tabs** for indentation, **single quotes**
- ESM modules (`"type": "module"` in package.json)
- SWC compiler for builds (configured in `nest-cli.json`)
- Vitest for testing with SWC plugin (`unplugin-swc`)
- Unit tests in `src/test/` as `*.spec.ts`, E2E tests in `src/test/e2e/` as `*.e2e-spec.ts`
- Tests require Redis running locally (CI uses Redis 8 Alpine)
- Node.js >= 24.12.0, pnpm package manager
