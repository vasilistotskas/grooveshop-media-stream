[![CI](https://github.com/vasilistotskas/grooveshop-media-stream/actions/workflows/ci.yml/badge.svg)](https://github.com/vasilistotskas/grooveshop-media-stream/actions/workflows/ci.yml)

# grooveshop-media-stream

Image processing and caching service for the GrooveShop platform, built with NestJS and Sharp.

GrooveShop is a multi-tenant e-commerce platform: a Django API, a Nuxt storefront, this media
stream, an agent gateway for AI agents, Kubernetes infrastructure and a documentation site. The
media stream fetches original images from the backend, resizes and converts them, caches the
result per tenant and streams it to the browser. The storefront builds image URLs directly against
this service; nothing goes through Nuxt. See the
[platform architecture](https://docs.grooveshop.space/dev/platform/architecture) (developer docs,
behind basic auth).

## Features

- Resize, crop and convert on the fly: every option (width, height, fit, position, background,
  trim threshold, quality, output format) is a path segment, so each URL is one cacheable variant.
  Output formats: AVIF, WebP, JPEG, PNG, GIF, TIFF; SVG is never encoded, so an SVG output
  request is answered with PNG bytes. An SVG source is sanitised first: requested without a width
  or height it is served as SVG, with one it is rasterised to the requested format.
- Tenant-scoped media (`media/<tenantSchema>/uploads/...`) and shared static images. Images of a
  suspended store are refused with a 503.
- Layered cache: memory, then Redis, then an on-disk store, with per-tenant keys, cache warming
  of frequently read files and a nightly disk cleanup.
- Per-tenant cache flush across every replica (`POST /admin/cache/flush-tenant`, broadcast over
  Redis pub/sub), which Django calls when a store is suspended, reactivated or deleted.
- Input hardening: request validation, a host allowlist for upstream fetches (static list plus
  Django's tenant-domain feed), source-format sniffing with per-format size limits, SVG
  sanitisation, no upstream redirects.
- Back-pressure: admission control on Sharp pipelines (503 with `Retry-After` when overloaded),
  adaptive rate limiting, a Redis-persisted circuit breaker on upstream fetches, graceful shutdown.
- Observability: one structured JSON log line per image request, Prometheus metrics at `/metrics`
  (bearer token), and liveness, readiness and dependency health endpoints.

## Tech stack

- NestJS 12 on Node.js (the supported range is `engines` in `package.json`), TypeScript, ESM
- Sharp (libvips) for image processing
- Redis (ioredis) for the shared cache tier, rate-limit counters and circuit-breaker state
- Vitest with SWC, ESLint (`@antfu/eslint-config`)
- pnpm (the version is pinned by `packageManager` in `package.json`)

## Getting started

Prerequisites: Node.js and pnpm as above, and a Redis server (the cache and the test suites need it).

```bash
git clone https://github.com/vasilistotskas/grooveshop-media-stream.git
cd grooveshop-media-stream
pnpm install
cp .env.example .env    # set BACKEND_URL, REDIS_HOST/REDIS_PORT, INTERNAL_ADMIN_SECRET, ...
pnpm run dev            # http://127.0.0.1:3003
```

`.env.example` lists every setting with its default; it mirrors the config schema in
`src/MediaStream/common/utils/config-schema.util.ts`, which is the single source of truth.

A request has this shape (every segment is mandatory):

```
GET /media_stream-image/media/<tenantSchema>/uploads/<path>/<width>/<height>/<fit>/<position>/<background>/<trimThreshold>/<quality>.<format>
GET /media_stream-image/static/images/<image>/<width>/<height>/<fit>/<position>/<background>/<trimThreshold>/<quality>.<format>
```

To run the published image with a local Redis instead:

```bash
cp .env.docker.example .env.docker
docker compose -f docker/compose.yaml up
```

## Common commands

```bash
pnpm run dev            # Development server with watch mode
pnpm run build          # Production build (SWC)
pnpm run prod           # Run the production build
pnpm run lint           # ESLint with auto-fix
pnpm run lint:ci        # ESLint without fixing (what CI runs)
pnpm run type-check     # tsc over the sources and the specs
pnpm run test           # Unit and integration tests
pnpm run test:coverage  # Same suite with the coverage floors from vitest.config.ts
pnpm run test:e2e       # End-to-end tests
pnpm run test:perf      # Performance specs (excluded from `test`)
pnpm run cache:clear    # Clear the Redis and on-disk image cache
```

Run one file with `pnpm exec vitest run <path-to-spec> --no-coverage`.

## Project layout

```
src/MediaStream/
├── API/          # Image controller, request validation, URL building, streaming
├── Cache/        # Memory and Redis layers, the image cache operation, warming, tenant flush
├── Config/       # Schema-built configuration, validated at startup
├── Correlation/  # Correlation ids, timing, per-request log record
├── Health/       # Health endpoints and indicators
├── HTTP/         # Upstream HTTP client, retries, circuit breaker
├── Metrics/      # Prometheus metrics
├── Processing/   # Sharp jobs, admission control, Sharp configuration
├── RateLimit/    # Adaptive rate-limit guard
├── Storage/      # On-disk cache inventory and nightly cleanup
├── Validation/   # Security checks, upstream allowlist, tenant-domain feed
└── common/       # Shared errors, utilities, constants
```

Tests live in `src/test/`, mirroring this tree. [`CLAUDE.md`](CLAUDE.md) describes the request
flow, the cache and the conventions in detail.

## Deployment and release

Releases are cut by semantic-release from Conventional Commits on `main`: the CI workflow tags the
version and creates the GitHub Release, which builds the production image
(`docker/Dockerfile`) and publishes it to Docker Hub (`gro0ve/grooveshop-media-stream`) and the
GitHub Container Registry. The cluster runs the version pinned in the GitOps repository
`grooveshop-infrastructure`; Argo CD deploys it.

## Documentation

- [`docs/`](docs/): request logs and metrics reference
  ([`docs/observability.md`](docs/observability.md)); published on the docs site.
- [Media stream developer docs](https://docs.grooveshop.space/dev/media/) (behind basic auth).
- [docs.grooveshop.space](https://docs.grooveshop.space): the platform documentation site.

## Related repositories

- [grooveshop-django-api](https://github.com/vasilistotskas/grooveshop-django-api): Django REST API, admin, and background jobs; the platform's source of truth
- [grooveshop-storefront-ui-node-nuxt](https://github.com/vasilistotskas/grooveshop-storefront-ui-node-nuxt): Nuxt server-rendered storefront for every store
- [grooveshop-agent-gateway](https://github.com/vasilistotskas/grooveshop-agent-gateway): Go gateway for AI agents (MCP, UCP, ACP), catalogue feeds and the storefront chat
- grooveshop-infrastructure (private): Kubernetes manifests deployed by Argo CD
- [grooveshop-docs](https://github.com/vasilistotskas/grooveshop-docs): the documentation site at docs.grooveshop.space

## Licence

Source-available under the [PolyForm Strict License 1.0.0](LICENSE.md): you may use it for
noncommercial purposes; you may not distribute it or make changes or new works based on it.
Commercial use needs a separate licence from the author.
