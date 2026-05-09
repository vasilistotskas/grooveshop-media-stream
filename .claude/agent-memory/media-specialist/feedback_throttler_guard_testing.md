---
name: Testing AdaptiveRateLimitGuard (extends ThrottlerGuard) setup
description: ThrottlerGuard subclass tests need specific providers, module.init(), and response mock shape
type: feedback
---

Testing `AdaptiveRateLimitGuard` (which extends `ThrottlerGuard`) requires:

1. Provide `getOptionsToken()` with `[{ ttl: 60, limit: 100, name: 'default' }]` (array format, NOT `{throttlers:[...]}`). ThrottlerGuard checks `Array.isArray(options)`.
2. Provide `getStorageToken()` with `{ increment: vi.fn(), getRecord: vi.fn() }`.
3. Provide `Reflector` directly.
4. Call `await module.init()` after `compile()` — ThrottlerGuard.onModuleInit() sets `this.throttlers` which is required by `canActivate()`.
5. Mock execution context needs `getHandler: () => ({})` and `getClass: () => ({})` — ThrottlerGuard.canActivate() calls these via Reflector to check skip metadata.
6. Mock response needs `header: vi.fn()` in addition to `setHeader: vi.fn()` — ThrottlerGuard.handleRequest() calls `res.header()`.

**Why:** ThrottlerGuard has its own `onModuleInit` that populates `this.throttlers` from the injected options; without calling `module.init()`, the array is undefined and `for...of` throws.
