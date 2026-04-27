/**
 * PostToolUse hook: Auto-lint TypeScript files after Edit/Write in grooveshop-media-stream.
 *
 * Runs `pnpm exec eslint --fix` on .ts, .mts, .js, .mjs, .cjs files.
 * Silently catches errors (ESLint failures don't block the workflow).
 *
 * Receives JSON on stdin: { tool_name, tool_input: { file_path, ... } }
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const input = JSON.parse(readFileSync(0, 'utf8'))
const filePath = input.tool_input?.file_path

if (filePath && /\.(ts|mts|js|mjs|cjs)$/.test(filePath)) {
  try {
    execSync(`pnpm exec eslint --fix ${JSON.stringify(filePath)}`, { stdio: 'pipe' })
  }
  catch {
    // ESLint errors are non-blocking
  }
}
