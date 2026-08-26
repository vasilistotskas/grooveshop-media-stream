---
name: run-tests
description: Run vitest tests for specific modules or all tests in grooveshop-media-stream
argument-hint: "[module|all|e2e]"
arguments: [module]
allowed-tools: Read, Grep, Glob, Bash
---

Run tests for the grooveshop-media-stream project. Target: `$module`
(default `all` when no argument was given).

Valid modules: API, Cache, Config, Correlation, Health, HTTP, Metrics,
Processing, RateLimit, Storage, Validation, common — plus `all` and `e2e`.

## Instructions

1. `all` (or no argument) → `pnpm run test`
2. `e2e` → `pnpm run test:e2e`
3. Otherwise → `pnpm exec vitest run src/test/$module/ --no-coverage`

For the `common` module, also include the related test directories:
`pnpm exec vitest run src/test/common/ src/test/utils/ src/test/errors/ src/test/filters/ --no-coverage`

Use `pnpm exec`, not `npx`: this is a pnpm workspace, and `npx` can resolve a
different vitest version from the registry than the one the project pins.

## After Running

- Report total tests: passed, failed, skipped
- For failures: show the test name, error message, and relevant source file
- Suggest fixes if the cause is obvious
