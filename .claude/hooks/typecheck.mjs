/**
 * Stop hook: type-check when TypeScript files were edited this session.
 *
 * - Reads the `.claude/.typecheck-pending` marker (written by track-typecheck.mjs).
 * - If absent: exit 0 silently (no edits, nothing to check).
 * - If `stop_hook_active` is true: exit 0, so a Stop hook can't loop.
 * - Otherwise run `pnpm run type-check`. On failure, exit 2 with the compiler
 *   output on stderr so the errors have to be addressed before the turn ends.
 *
 * `pnpm run type-check` is the project's own gate — `tsc --noEmit` for src plus
 * `tsc --noEmit -p tsconfig.spec.json` for the spec project. Checking only the
 * default project reports phantom errors on test files (vitest globals,
 * test-only paths) and misses real ones in them.
 *
 * A timeout or a missing toolchain exits 0: a slow or half-installed machine
 * must not be able to wedge every turn. Mirrors the storefront's Stop hook.
 */
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

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

const projectDir = resolve(process.env.CLAUDE_PROJECT_DIR || '.')
const markerPath = resolve(projectDir, '.claude', '.typecheck-pending')
if (!existsSync(markerPath)) {
  process.exit(0)
}

try {
  unlinkSync(markerPath)
}
catch {
  // If the marker survives, the next turn simply re-runs the check.
}

try {
  execSync('pnpm run type-check', {
    cwd: projectDir,
    stdio: 'pipe',
    timeout: 300_000,
    encoding: 'utf8',
  })
  process.exit(0)
}
catch (err) {
  if (err.code === 'ETIMEDOUT' || err.signal === 'SIGTERM') {
    process.stderr.write('type-check timed out after 5 minutes; run `pnpm run type-check` manually.\n')
    process.exit(0)
  }
  const output = `${err.stdout?.toString() || ''}${err.stderr?.toString() || ''}`.trim()
  if (/not recognized as an internal or external command|command not found/i.test(output)) {
    process.stderr.write('pnpm not found; skipping type-check.\n')
    process.exit(0)
  }
  process.stderr.write('Type check failed. Fix the TypeScript errors below before stopping:\n\n')
  process.stderr.write(output || err.message || 'pnpm run type-check failed with no output.')
  process.exit(2)
}
