/**
 * PostToolUse hook: Auto-lint TypeScript files after Edit/Write in grooveshop-media-stream.
 *
 * Runs `eslint --fix` on .ts, .mts, .cts, .js, .mjs, .cjs files, with the eslint
 * of the checkout that holds the file. Runs the binary with this process's node,
 * never through `pnpm`: `verifyDepsBeforeRun` defaults to `install`, and a hook must
 * never install. With no `node_modules` the hook does nothing.
 * Silently catches errors (ESLint failures don't block the workflow).
 *
 * Receives JSON on stdin: { tool_name, tool_input: { file_path, ... } }
 */
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { checkoutOf } from './lib/checkout.mjs'

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
}
catch {
  process.exit(0)
}
const filePath = input.tool_input?.file_path

if (filePath && /\.(ts|mts|cts|js|mjs|cjs)$/.test(filePath)) {
  const checkout = checkoutOf(filePath)
  const eslint = checkout && join(checkout, 'node_modules', 'eslint', 'bin', 'eslint.js')
  if (eslint && existsSync(eslint)) {
    try {
      execFileSync(process.execPath, [eslint, '--fix', filePath], { cwd: checkout, stdio: 'pipe', timeout: 120_000 })
    }
    catch {
      // ESLint errors are non-blocking
    }
  }
}
