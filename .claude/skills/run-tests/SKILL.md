---
name: run-tests
description: Run vitest tests for specific modules or all tests in grooveshop-media-stream
argument-hint: "[module|all|e2e|perf]"
arguments: [module]
allowed-tools: Read, Grep, Glob, Bash
---

Run tests for the grooveshop-media-stream project. Target: `$module`
(default `all` when no argument was given).

Valid modules (directories under `src/test/`): API, Cache, Config,
Correlation, Health, HTTP, Metrics, Module, Processing, RateLimit, Storage,
Validation, common — plus `all`, `e2e` and `perf`.

## Instructions

1. `all` (or no argument) → `pnpm run test`
2. `e2e` → `pnpm run test:e2e`
3. `perf` → `pnpm run test:perf` (wall-clock assertions; excluded from `all`)
4. Otherwise → `pnpm exec vitest run src/test/$module/ --no-coverage`

Redis must be running locally (default `localhost:6379`); the integration and
e2e suites talk to it. Coverage is off by default; `pnpm run test:coverage`
enforces the floors in `vitest.config.ts`.

Use `pnpm exec`, not `npx`: this is a pnpm workspace, and `npx` can resolve a
different vitest version from the registry than the one the project pins.

## After Running

- Report total tests: passed, failed, skipped
- For failures: show the test name, error message, and relevant source file
- Suggest fixes if the cause is obvious
