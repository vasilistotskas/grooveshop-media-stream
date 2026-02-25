[![CI](https://github.com/vasilistotskas/grooveshop-media-stream/actions/workflows/ci.yml/badge.svg)](https://github.com/vasilistotskas/grooveshop-media-stream/actions/workflows/ci.yml)

# Grooveshop Media Stream

A NestJS microservice for media streaming and image processing.

## Overview

This service provides image processing capabilities for the Grooveshop platform, including:
- Image resizing and format conversion (AVIF, WebP, JPEG, PNG, GIF, TIFF, SVG)
- Multi-layer caching (Memory → Redis → File system)
- Content negotiation (AVIF > WebP > JPEG > PNG from Accept header)
- Prometheus metrics and health check endpoints
- Circuit breaker pattern for upstream requests
- Adaptive rate limiting
- Background job queue for large image processing

## Setup and Installation

### Prerequisites
- Node.js >= 24.12.0
- pnpm >= 10.30.2
- Redis (required for queue and cache layer)

### Environment Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/vasilistotskas/grooveshop-media-stream.git
   cd grooveshop-media-stream
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Adjust the variables as needed

### Key Environment Variables
- `PORT`: Port for the NestJS application (default: 3003)
- `BACKEND_URL`: URL for the upstream image server
- `REDIS_HOST` / `REDIS_PORT`: Redis connection (required for queue and cache)
- `CACHE_MEMORY_MAX_SIZE`: Memory cache limit (default: 100MB)
- `CACHE_MEMORY_TTL`: Memory cache TTL in seconds (default: 3600)
- `REDIS_TTL`: Redis cache TTL in seconds (default: 7200)
- `CACHE_FILE_DIRECTORY`: File cache directory (default: `./storage`)
- `PROCESSING_MAX_CONCURRENT`: Max concurrent image processing (default: 10)
- `PROCESSING_TIMEOUT`: Processing timeout in ms (default: 30000)
- `MONITORING_ENABLED`: Enable monitoring (default: true)
- `CORS_ORIGIN`: CORS origin (default: `*`)
- `CORS_METHODS`: Allowed HTTP methods (default: `GET`)

See `.env.example` for the full list of configuration options.

## Running the Application

```bash
# Development with watch mode
pnpm run dev

# Production build and run
pnpm run build
pnpm run prod

# Linting
pnpm run lint

# Type checking
pnpm run type-check
```

### Docker

```bash
docker build -f docker/Dockerfile -t grooveshop-media-stream .
docker run -p 3003:3003 --env-file .env grooveshop-media-stream
```

Multi-architecture images are published to Docker Hub (`gro0ve/grooveshop-media-stream`) and GitHub Container Registry on each release.

### CORS Configuration

The application is configured with CORS enabled by default:

- Origin: `*` (all origins allowed)
- Methods: `GET` (only GET requests allowed)
- Max Age: `86400` (24 hours)

## API Endpoints

### Image Processing
- `GET /media_stream-image/media/uploads/:imagePath+/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format` — Process uploaded media images
- `GET /media_stream-image/static/images/:image/:width/:height/:fit/:position/:background/:trimThreshold/:quality.:format` — Process static images

### Configuration
- `GET /config/image-sources` — Image source configuration and available options

### Health
- `GET /health` — Full health check
- `GET /health/detailed` — System info and resource details
- `GET /health/ready` — Lightweight readiness check
- `GET /health/live` — Liveness check
- `GET /health/circuit-breaker` — Circuit breaker status
- `POST /health/circuit-breaker/reset` — Reset circuit breaker

### Metrics
- `GET /metrics` — Prometheus-format metrics
- `GET /metrics/health` — Metrics service health

## Testing

```bash
# Run all unit tests
pnpm run test

# Run end-to-end tests
pnpm run test:e2e

# Run tests with coverage
pnpm run test:coverage

# Run a single test file
npx vitest run src/test/Cache/services/memory-cache.service.spec.ts
```

Tests require Redis running locally. CI uses Redis 8 Alpine.

### Test Organization

The project uses Vitest with SWC for fast compilation. Unit tests are in `src/test/` as `*.spec.ts`, and E2E tests are in `src/test/e2e/` as `*.e2e-spec.ts`. Tests are organized by module matching the source structure.

## Project Structure

```
src/MediaStream/
├── API/            # Controllers, DTOs, image source config, request validation, URL building, streaming
├── Cache/          # Multi-layer caching (Memory → Redis → File), cache warming, eviction
├── Config/         # Centralized config service, schema-based validation, hot-reload
├── Correlation/    # Request correlation IDs, timing middleware, performance tracking
├── Health/         # Health check indicators (disk, memory, Sharp, cache, Redis, HTTP, storage)
├── HTTP/           # HTTP client with circuit breaker pattern, retry with exponential backoff
├── Metrics/        # Prometheus metrics via prom-client, request/system/cache metrics
├── Monitoring/     # System monitoring, alert rule engine, performance tracking
├── Queue/          # Bull/Redis job queue for background image processing
├── RateLimit/      # Adaptive rate limiting guard with domain whitelisting
├── Storage/        # File storage management, cleanup, intelligent eviction
├── Tasks/          # Scheduled tasks via @nestjs/schedule
├── Validation/     # Input sanitization, security threat detection
└── common/         # Shared error classes, exception filter, types, graceful shutdown
```

## Security

### Input Validation
- All request parameters validated before processing
- Multi-pass XSS/HTML sanitization (up to 10 iterations)
- URL domain whitelisting
- Security threat detection: XSS, SQL injection, path traversal, command injection, XXE, NoSQL injection
- Entropy-based payload detection

### Rate Limiting
- Adaptive rate limiting based on system load
- IP + user-agent + request type keying
- Bypasses for health checks, metrics, whitelisted domains, and bots

### Error Handling
- Global exception filter with correlation ID enrichment
- Structured JSON error responses
- Fallback to default image on processing errors

### Infrastructure
- Helmet security headers
- CORS restricted to GET methods
- Circuit breaker for upstream services
- Graceful shutdown with two-tier timeout (30s soft, 60s force)

## Utility Scripts

```bash
pnpm run cache:clear                  # Clear Redis + file system cache
node scripts/analyze-imports.cjs      # Detect incorrect import patterns
node scripts/fix-imports.cjs          # Auto-fix internal imports to relative paths
node scripts/inject-version.cjs       # Inject version into public/index.html (runs as prebuild)
```
