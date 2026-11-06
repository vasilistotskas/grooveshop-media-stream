/**
 * PostToolUse hook: mark the edited checkout as needing a type check.
 *
 * Records the checkout under this session whenever a .ts/.mts/.cts file is edited.
 * The Stop hook (typecheck.mjs) reads the marker to decide whether to type-check,
 * so a turn that touched no TypeScript costs nothing.
 *
 * Receives JSON on stdin: { session_id, tool_name, tool_input: { file_path, ... } }
 */
import { readFileSync } from 'node:fs'
import { checkoutOf, markPending } from './lib/checkout.mjs'

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8'))
}
catch {
  process.exit(0)
}

const filePath = input.tool_input?.file_path
if (filePath && /\.(ts|mts|cts)$/.test(filePath)) {
  const checkout = checkoutOf(filePath)
  if (checkout) markPending(input.session_id, checkout)
}
