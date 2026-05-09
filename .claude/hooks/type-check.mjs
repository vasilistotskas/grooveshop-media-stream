/**
 * PostToolUse hook: Type-check after .ts/.mts edits in grooveshop-media-stream.
 *
 * Runs `tsc --noEmit --incremental` on the project. The .tsbuildinfo cache
 * keeps subsequent runs fast. Only surfaces errors that mention the changed
 * file so unrelated pre-existing project errors don't drown the signal.
 *
 * Non-blocking: errors are printed to stderr but exit code is always 0.
 *
 * Receives JSON on stdin: { tool_name, tool_input: { file_path, ... } }
 */
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { basename, relative, sep } from 'node:path'

const input = JSON.parse(readFileSync(0, 'utf8'))
const filePath = input.tool_input?.file_path

if (!filePath || !/\.(ts|mts)$/.test(filePath)) {
  process.exit(0)
}

let output = ''
try {
  execSync('pnpm exec tsc --noEmit --incremental --pretty false', { stdio: 'pipe' })
  process.exit(0)
}
catch (err) {
  output = `${err.stdout?.toString() ?? ''}${err.stderr?.toString() ?? ''}`
}

const fileName = basename(filePath)
const normalized = filePath.replace(/\\/g, '/')
const cwdNorm = process.cwd().replace(/\\/g, '/')
const rel = normalized.startsWith(cwdNorm) ? normalized.slice(cwdNorm.length + 1) : normalized

const matches = output
  .split(/\r?\n/)
  .filter(line => line.includes(fileName) || line.includes(rel))
  .slice(0, 20)

if (matches.length > 0) {
  process.stderr.write(`type-check errors in ${fileName}:\n${matches.join('\n')}\n`)
}

process.exit(0)
