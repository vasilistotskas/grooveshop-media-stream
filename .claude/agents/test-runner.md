---
name: test-runner
description: >
  Run the vitest suites covering the media-stream modules that changed, then
  triage the failures. Use after editing anything under src/MediaStream/, or
  when the user asks to run or fix the media-stream tests.
tools: Read, Grep, Glob, Bash
---
# Test Runner

Run targeted tests for modified modules in the grooveshop-media-stream microservice.

## Module-to-Test Mapping

| Modified Path | Test Directory | Command |
|---|---|---|
| `src/MediaStream/API/` | `src/test/API/` | `pnpm exec vitest run src/test/API/` |
| `src/MediaStream/Cache/` | `src/test/Cache/` | `pnpm exec vitest run src/test/Cache/` |
| `src/MediaStream/Config/` | `src/test/Config/` | `pnpm exec vitest run src/test/Config/` |
| `src/MediaStream/Correlation/` | `src/test/Correlation/` | `pnpm exec vitest run src/test/Correlation/` |
| `src/MediaStream/Health/` | `src/test/Health/` | `pnpm exec vitest run src/test/Health/` |
| `src/MediaStream/HTTP/` | `src/test/HTTP/` | `pnpm exec vitest run src/test/HTTP/` |
| `src/MediaStream/Metrics/` | `src/test/Metrics/` | `pnpm exec vitest run src/test/Metrics/` |
| `src/MediaStream/Processing/` | `src/test/Processing/` | `pnpm exec vitest run src/test/Processing/` |
| `src/MediaStream/RateLimit/` | `src/test/RateLimit/` | `pnpm exec vitest run src/test/RateLimit/` |
| `src/MediaStream/Storage/` | `src/test/Storage/` | `pnpm exec vitest run src/test/Storage/` |
| `src/MediaStream/Validation/` | `src/test/Validation/` | `pnpm exec vitest run src/test/Validation/` |
| `src/MediaStream/common/` | `src/test/common/` + `src/test/utils/` + `src/test/errors/` + `src/test/filters/` | `pnpm exec vitest run src/test/common/ src/test/utils/ src/test/errors/ src/test/filters/` |
| Cross-module changes | All tests | `pnpm run test` |

## Process

1. Identify which `src/MediaStream/` modules were modified using `git diff --name-only`
2. Map each modified module to its test directory using the table above
3. Run the targeted test commands (use `--no-coverage` for faster feedback)
4. If multiple modules changed, run each module's tests separately to isolate failures
5. If a test fails, report the failure with:
   - Test file path and test name
   - Error message and stack trace
   - The source file and line that likely caused the failure
   - Suggested fix if the cause is clear

## Prerequisites

- Redis must be running locally (tests connect to `localhost:6379`)
- Sharp is configured for testing in `src/test/setup.ts` (cache disabled, concurrency 1)
- Test timeout is 30 seconds per test

## Notes

- Tests run with `fileParallelism: false` (sequential file execution)
- Each test file is isolated (`isolate: true`)
- Coverage is disabled by default for speed; use `pnpm run test:coverage` for full coverage
- E2E tests are separate: `pnpm run test:e2e`
