/**
 * PreToolUse hook: Block edits to sensitive files in grooveshop-media-stream.
 *
 * Blocks: .env, .env.*, pnpm-lock.yaml, package-lock.json, settings.local.json
 * Allows: .env.example (template file meant to be edited)
 *
 * Receives JSON on stdin: { tool_name, tool_input: { file_path, ... } }
 * Exit 0 = allow, Exit 2 = block (stderr shown as reason)
 */
import { readFileSync } from 'node:fs'

const input = JSON.parse(readFileSync(0, 'utf8'))
const filePath = input.tool_input?.file_path || ''

const normalized = filePath.replace(/\\/g, '/')

const isEnvFile = /(^|\/)\.env($|\.)/.test(normalized)
const isEnvExample = /(^|\/)\.env\.example$/.test(normalized)
const isPnpmLock = /(^|\/)pnpm-lock\.yaml$/.test(normalized)
const isNpmLock = /(^|\/)package-lock\.json$/.test(normalized)
const isLocalSettings = /(^|\/)settings\.local\.json$/.test(normalized)

const isBlocked = (isEnvFile && !isEnvExample) || isPnpmLock || isNpmLock || isLocalSettings

if (isBlocked) {
  const reason = (isPnpmLock || isNpmLock)
    ? 'Use pnpm to manage dependencies instead.'
    : isLocalSettings
        ? 'settings.local.json is per-machine; edit settings.json instead.'
        : 'Edit .env.example instead.'
  process.stderr.write(`BLOCKED: ${filePath} should not be edited manually. ${reason}`)
  process.exit(2)
}
