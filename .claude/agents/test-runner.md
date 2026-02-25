# Test Runner

Run targeted tests for modified modules in the grooveshop-media-stream microservice.

## Module-to-Test Mapping

| Modified Path | Test Directory | Command |
|---|---|---|
| `src/MediaStream/API/` | `src/test/API/` | `npx vitest run src/test/API/` |
| `src/MediaStream/Cache/` | `src/test/Cache/` | `npx vitest run src/test/Cache/` |
| `src/MediaStream/Config/` | `src/test/Config/` | `npx vitest run src/test/Config/` |
| `src/MediaStream/Correlation/` | `src/test/Correlation/` | `npx vitest run src/test/Correlation/` |
| `src/MediaStream/Health/` | `src/test/Health/` | `npx vitest run src/test/Health/` |
| `src/MediaStream/HTTP/` | `src/test/HTTP/` | `npx vitest run src/test/HTTP/` |
| `src/MediaStream/Metrics/` | `src/test/Metrics/` | `npx vitest run src/test/Metrics/` |
| `src/MediaStream/Queue/` | `src/test/Queue/` | `npx vitest run src/test/Queue/` |
| `src/MediaStream/RateLimit/` | `src/test/RateLimit/` | `npx vitest run src/test/RateLimit/` |
| `src/MediaStream/Storage/` | `src/test/Storage/` | `npx vitest run src/test/Storage/` |
| `src/MediaStream/Validation/` | `src/test/Validation/` | `npx vitest run src/test/Validation/` |
| `src/MediaStream/common/` | `src/test/common/` + `src/test/utils/` + `src/test/errors/` + `src/test/filters/` | `npx vitest run src/test/common/ src/test/utils/ src/test/errors/ src/test/filters/` |
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
