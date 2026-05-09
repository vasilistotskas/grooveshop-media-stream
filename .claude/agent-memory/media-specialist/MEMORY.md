# Media Specialist Agent Memory

- [Test Patterns: Health Indicators throw HealthCheckError](feedback_health_indicator_throws.md) — BaseHealthIndicator.isHealthy() throws, not returns, on error
- [Test Patterns: Processor errors bubble up to Bull](feedback_processor_errors_bubble.md) — ImageProcessingProcessor lets errors throw for Bull retry machinery
- [Single-axis zero dimension is valid](feedback_zero_dimension_valid.md) — (0, h) and (w, 0) are valid resize requests for aspect-ratio-preserving resize
- [ThrottlerGuard testing setup](feedback_throttler_guard_testing.md) — Requires getOptionsToken, getStorageToken, Reflector, module.init(), and res.header mock