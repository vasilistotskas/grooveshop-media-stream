---
name: run-tests
description: Run vitest tests for specific modules or all tests in grooveshop-media-stream
arguments:
  - name: module
    description: "Module name (API, Cache, Config, Correlation, Health, HTTP, Metrics, Queue, RateLimit, Storage, Validation, common, e2e) or 'all'"
    required: false
    default: "all"
---

Run tests for the grooveshop-media-stream project.

## Instructions

1. If `module` is "all", run: `pnpm run test`
2. If `module` is "e2e", run: `pnpm run test:e2e`
3. Otherwise, run: `npx vitest run src/test/{module}/ --no-coverage`

For the `common` module, also include related test directories:
`npx vitest run src/test/common/ src/test/utils/ src/test/errors/ src/test/filters/ --no-coverage`

## After Running

- Report total tests: passed, failed, skipped
- For failures: show the test name, error message, and relevant source file
- Suggest fixes if the cause is obvious
