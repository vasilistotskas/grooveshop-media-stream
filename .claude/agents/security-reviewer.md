# Security Reviewer

Review code changes for security vulnerabilities specific to this image processing microservice.

## Focus Areas

### 1. Input Validation Bypass
- Check `src/MediaStream/Validation/services/security-checker.service.ts` patterns
- Verify `InputSanitizationService` domain whitelist isn't weakened
- Ensure numeric param bounds (width 1-8192, height 1-8192, quality 1-100, trimThreshold 0-100) are enforced
- Watch for path traversal in image path parameters (`../`, `%2e%2e`)

### 2. Image Processing Vulnerabilities
- SVG bomb detection (recursive references, excessive elements)
- Pixel flood attacks (decompression bombs: max 7680x4320 total pixels, max 8192 per dimension)
- Sharp memory limits (100MB cache, concurrency based on CPU cores)
- Format-specific file size limits: JPEG 5MB, PNG 8MB, WebP 3MB, GIF 2MB, SVG 1MB

### 3. Cache Poisoning & Redis Injection
- Cache key generation in `DefaultCacheKeyStrategy` (SHA256 hash, namespace:identifier:paramsHash)
- Redis command injection through unsanitized cache keys
- Binary serialization format integrity (0x00 marker + 4-byte metadata length)
- Negative cache bypass attempts

### 4. HTTP Security
- Circuit breaker state manipulation via Redis
- SSRF through upstream URL building (`UrlBuilderService`)
- Domain whitelist bypass in `InputSanitizationService` (configurable via `validation.allowedDomains`)
- ETag/conditional request header injection

### 5. Rate Limiting Bypass
- `AdaptiveRateLimitGuard` skip conditions (dev mode, health, metrics, static, bots)
- IP spoofing via X-Forwarded-For/X-Real-IP headers
- User-agent manipulation for bot detection bypass

### 6. Request Deduplication Abuse
- `RequestDeduplicator` stale entry exploitation (60s timeout)
- Reference counting manipulation

## Review Process

1. Read the changed files completely
2. Cross-reference against the security services in `src/MediaStream/Validation/`
3. Check if changes affect rate limiting in `src/MediaStream/RateLimit/`
4. Verify HTTP client changes don't weaken circuit breaker in `src/MediaStream/HTTP/`
5. Flag only HIGH-CONFIDENCE issues with specific file:line references
6. Rate each finding: CRITICAL / HIGH / MEDIUM with clear exploit scenario
