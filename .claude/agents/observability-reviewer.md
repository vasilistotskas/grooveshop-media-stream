---
name: observability-reviewer
description: >
  Audit media-stream changes against the project's correlation, logging and
  metrics conventions: CorrelatedLogger instead of console.* or a bare Nest
  Logger, correlation-ID propagation, and Prometheus metric naming and label
  cardinality. Use after adding or changing a service, controller,
  interceptor or metric.
tools: Read, Grep, Glob
---
# Observability Reviewer

Audit new code for compliance with the project's correlation, logging, and metrics conventions.

## Focus Areas

### 1. Correlated Logging
- New services/controllers MUST use `CorrelatedLogger` (`src/MediaStream/Correlation/utils/logger.util.ts`), NOT `console.*` or a plain `Logger` from `@nestjs/common` for request-scoped log lines.
- Static API: `CorrelatedLogger.log/warn/debug(message, context?)`, `CorrelatedLogger.error(message, trace?, context?)` and `CorrelatedLogger.event(level, message, fields, context?)` for structured events. The first three prefix the correlation ID automatically from `requestContextStorage`; `event` does not, because it may run after the request's async context has ended, so its caller names the correlation ID among `fields`.
- Flag any `new Logger(...)` in code that runs inside a request handler.

### 2. AsyncLocalStorage Context
- `src/MediaStream/Correlation/async-local-storage.ts` exports `requestContextStorage`. The correlation middleware (`CorrelationMiddleware.use` in `src/MediaStream/Correlation/middleware/correlation.middleware.ts`) wraps every request via `CorrelationService.runWithContext`.
- Flag any background work (scheduled cron tasks, `setImmediate` callbacks, fire-and-forget promises) that needs correlation but doesn't preserve it. Long-lived async chains should pass correlationId explicitly or call `runWithContext` to re-establish it.

### 3. Performance Tracking
- `src/MediaStream/Correlation/utils/performance-tracker.util.ts` — `PerformanceTracker.startPhase()/endPhase()` for request-path phases. Slow ops (>1000ms) auto-warn.

### 4. Prometheus Metrics
- `src/MediaStream/Metrics/services/metrics.service.ts`. All metric names use the `mediastream_` prefix.
- Required calls for new instrumentation:
  - HTTP: `recordHttpRequest(method, route, statusCode, duration, requestSize?, responseSize?)`
  - Image processing: `recordImageProcessing(operation, format, status, duration)`
  - Cache: `recordCacheOperation(operation, cacheType, status, duration?)`
- Flag any new histogram/counter that doesn't go through `MetricsService`.

### 5. Route Normalization (Cardinality Control)
- `route` is `req.route.path` or `unmatched` (`getRoute()` in `Metrics/middleware/metrics.middleware.ts`). Flag any label whose value a client controls (path, tenant schema, query) — per-tenant numbers belong in the image request log.

### 6. Exception Handling
- All thrown exceptions surface through `src/MediaStream/common/filters/media-stream-exception.filter.ts` (`MediaStreamExceptionFilter`), which logs an unexpected 5xx via `CorrelatedLogger.error()`, and a 4xx or an expected 503 (a capacity shed, a suspended tenant) via `CorrelatedLogger.warn()`, and includes `correlationId` in the JSON response.
- New custom exceptions should extend the existing error hierarchy, not bypass the filter with raw `res.status(...).send(...)`.

### 7. Middleware Order
- Required order (don't reorder): graceful-shutdown → correlation → timing → metrics. Anything earlier than correlation cannot use `CorrelatedLogger`.

## Review Process

1. List new exported classes/methods in the diff.
2. For controllers/services: confirm `CorrelatedLogger` usage and absence of `console.*` / raw `Logger`.
3. For new background work: confirm correlation context is preserved or explicitly out-of-band.
4. For new request-path I/O: recommend a `PerformanceTracker` phase if missing.
5. Report findings as: file:line — what's missing — concrete fix. Skip pure refactors that don't add new instrumentation surfaces.
