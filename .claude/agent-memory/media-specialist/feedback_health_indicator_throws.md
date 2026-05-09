---
name: Health indicator throws HealthCheckError on failure
description: BaseHealthIndicator.isHealthy() throws HealthCheckError (not returns down result) when performHealthCheck fails
type: feedback
---

`BaseHealthIndicator.isHealthy()` catches errors from `performHealthCheck()` and re-throws them as `HealthCheckError` (from `@nestjs/terminus`). Tests that call `isHealthy()` on an error path must use try/catch and check `err.causes[key].status === 'down'`, NOT `expect(result.status).toBe('down')`.

**Why:** The base class design propagates errors up the NestJS health check chain so they can be aggregated by `HealthCheckService`. Returning a value would hide the error from the health endpoint.

**How to apply:** Any test that mocks `getDiskSpaceInfo`, `checkThresholds`, `getStorageStats`, etc. to reject/throw must wrap `await indicator.isHealthy()` in try/catch, assert `err instanceof HealthCheckError`, and inspect `err.causes` for the indicator key.
