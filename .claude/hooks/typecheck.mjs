/**
 * Stop hook: type-check the checkouts this session edited.
 *
 * - Reads the session's marker (written by track-typecheck.mjs).
 * - If absent: exit 0 silently (no edits, nothing to check).
 * - If `stop_hook_active` is true: exit 0, so a Stop hook can't loop.
 * - Otherwise run the project's `type-check` script body in each checkout: `tsc
 *   --noEmit` for src plus `tsc --noEmit -p tsconfig.spec.json` for the spec project.
 *   Checking only the default project reports phantom errors on test files (vitest
 *   globals, test-only paths) and misses real ones in them. On failure, exit 2 with
 *   the compiler output on stderr so the errors have to be addressed before the turn
 *   ends.
 *
 * Runs the checkout's own `tsc` with this process's node, never through `pnpm`:
 * `verifyDepsBeforeRun` defaults to `install`, and a hook must never install.
 *
 * A timeout puts the marker back and exits 0: a slow machine must not be able to
 * wedge every turn. A checkout with no `node_modules` is skipped, not re-marked:
 * retrying cannot fix it.
 */
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { markPending, takePending } from './lib/checkout.mjs'

const TSC_RUNS = [['--noEmit'], ['--noEmit', '-p', 'tsconfig.spec.json']]
const TIMEOUT_MS = 150_000

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
}
catch {
  // A malformed payload should not block the turn.
}

if (input.stop_hook_active) {
  process.exit(0)
}

let failed = false
for (const checkout of takePending(input.session_id)) {
  const tsc = join(checkout, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!existsSync(tsc)) {
    process.stderr.write(`typescript is not installed in ${checkout}; skipping type-check.\n`)
    continue
  }
  for (const args of TSC_RUNS) {
    try {
      execFileSync(process.execPath, [tsc, ...args], {
        cwd: checkout,
        stdio: 'pipe',
        timeout: TIMEOUT_MS,
        encoding: 'utf8',
      })
    }
    catch (err) {
      if (err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM') {
        markPending(input.session_id, checkout)
        process.stderr.write(`tsc ${args.join(' ')} timed out in ${checkout}; it will run again next turn.\n`)
        break
      }
      const output = `${err.stdout?.toString() || ''}${err.stderr?.toString() || ''}`.trim()
      process.stderr.write(`Type check failed in ${checkout}. Fix the TypeScript errors below before stopping:\n\n`)
      process.stderr.write(output || err.message || 'tsc failed with no output.')
      failed = true
      break
    }
  }
}

process.exit(failed ? 2 : 0)
