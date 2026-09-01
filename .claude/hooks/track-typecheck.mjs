/**
 * PostToolUse hook: mark TypeScript files as needing a type check.
 *
 * Touches `.claude/.typecheck-pending` whenever a .ts/.mts/.cts file is edited.
 * The Stop hook (typecheck.mjs) reads this marker to decide whether to run
 * `pnpm run type-check`, so a turn that touched no TypeScript costs nothing.
 *
 * This replaces the previous approach of running a whole-project `tsc --noEmit`
 * on *every* edit: that spent up to 300s per keystroke-sized change, and
 * reported only the errors mentioning the edited file, so a break it caused
 * elsewhere went unseen. Mirrors the storefront's track/Stop pair.
 *
 * Receives JSON on stdin: { tool_name, tool_input: { file_path, ... } }
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
}
catch {
  process.exit(0)
}

const filePath = input.tool_input?.file_path
if (filePath && /\.(ts|mts|cts)$/.test(filePath)) {
  // Anchor on CLAUDE_PROJECT_DIR, not cwd: the Stop hook must find the same
  // marker even when the hook's working directory isn't the project root.
  const markerPath = resolve(process.env.CLAUDE_PROJECT_DIR || '.', '.claude', '.typecheck-pending')
  try {
    mkdirSync(dirname(markerPath), { recursive: true })
    writeFileSync(markerPath, String(Date.now()))
  }
  catch {
    // A missing marker only skips the check; never break the edit over it.
  }
}
