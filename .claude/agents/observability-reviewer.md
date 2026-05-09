# Observability Reviewer

Audit new code for compliance with the project's correlation, logging, and metrics conventions.

## Focus Areas

### 1. Correlated Logging
- New services/controllers MUST use `CorrelatedLogger` (`src/MediaStream/Correlation/utils/logger.util.ts`), NOT `console.*` or a plain `Logger` from `@nestjs/common` for request-scoped log lines.
- Static API: `CorrelatedLogger.log/error/warn/debug/verbose(message, context)`. Correlation ID is injected automatically from `requestContextStorage`.
- Flag any `new Logger(...)` in code that runs inside a request handler.

### 2. AsyncLocalStorage Context
- `src/MediaStream/Correlation/async-local-storage.ts` exports `requestContextStorage`. The correlation middleware (`src/MediaStream/Correlation/middleware/correlation.middleware.ts:30`) wraps every request via `runWithContext`.
- Flag any background work (Bull processors, scheduled tasks, `setImmediate` callbacks) that needs correlation but doesn't preserve it. Long-lived async chains should pass correlationId explicitly or call `runWithContext` to re-establish it.

### 3. Performance Tracking
- `src/MediaStream/Correlation/utils/performance-tracker.util.ts` — `PerformanceTracker.startPhase()/endPhase()` for inline phases, `@PerformanceTracker.measureMethod()` decorator (factory at line 193) for whole methods.
- New methods that do >1 RTT (network, queue, file I/O) or are on the request path should be wrapped. Slow ops (>1000ms) auto-warn.

### 4. Prometheus Metrics
- `src/MediaStream/Metrics/services/metrics.service.ts`. All metric names use the `mediastream_` prefix.
- Required calls for new instrumentation:
  - HTTP: `recordHttpRequest(method, route, statusCode, duration, requestSize?, responseSize?)`
  - Image processing: `recordImageProcessing(operation, format, status, duration)`
  - Cache: `recordCacheOperation(operation, cacheType, status, duration?)`
- Flag any new histogram/counter that doesn't go through `MetricsService`.

### 5. Route Normalization (Cardinality Control)
- `src/MediaStream/Metrics/middleware/metrics.middleware.ts:78-93` — `getRoute()` replaces UUIDs, ObjectIds, numeric IDs with placeholders and caps depth at 5 segments.
- New route patterns with high-cardinality params (hashes, timestamps, image paths) need an entry in `getRoute()` or they will explode Prometheus cardinality. Flag this before merge.

### 6. Exception Handling
- All thrown exceptions surface through `src/MediaStream/common/filters/media-stream-exception.filter.ts` (`MediaStreamExceptionFilter`), which logs via `CorrelatedLogger.error()` and includes `correlationId` in the JSON response.
- New custom exceptions should extend the existing error hierarchy, not bypass the filter with raw `res.status(...).send(...)`.

### 7. Middleware Order
- Required order (don't reorder): graceful-shutdown → correlation → timing → metrics. Anything earlier than correlation cannot use `CorrelatedLogger`.

## Review Process

1. List new exported classes/methods in the diff.
2. For controllers/services: confirm `CorrelatedLogger` usage and absence of `console.*` / raw `Logger`.
3. For new routes: confirm `getRoute()` would normalize them; if not, recommend adding the regex.
4. For new background work: confirm correlation context is preserved or explicitly out-of-band.
5. For new public methods doing I/O: recommend `@PerformanceTracker.measureMethod()` if missing.
6. Report findings as: file:line — what's missing — concrete fix. Skip pure refactors that don't add new instrumentation surfaces.
