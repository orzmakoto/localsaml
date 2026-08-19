import { spawnSync } from 'node:child_process'
import { listSps } from '../config.js'
import { paths, resolveHome } from '../paths.js'
import { fail } from '../ui.js'

export function edit(profile: string, _opts: object): void {
  const home = resolveHome()
  const known = listSps(home)
  if (!known.includes(profile)) {
    fail(`Unknown profile "${profile}". Known: ${known.join(', ') || '(none)'}`)
  }

  const file = paths(home).sp(profile)
  const configured = process.env.VISUAL || process.env.EDITOR || 'vi'
  const [editor, ...args] = splitCommand(configured)
  if (!editor) fail('Editor command is empty')
  const result = spawnSync(editor, [...args, file], {
    stdio: 'inherit',
  })
  if (result.error) fail(`Could not start editor: ${result.error.message}`)
  if (result.status !== 0) fail(`Editor exited with status ${result.status ?? 'unknown'}`)
}

/** Small shell-like tokenizer without invoking a shell. */
function splitCommand(command: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: '"' | "'" | undefined
  let escaped = false

  for (const char of command.trim()) {
    if (escaped) {
      current += char
      escaped = false
    } else if (char === '\\' && quote !== "'") {
      escaped = true
    } else if (quote) {
      if (char === quote) quote = undefined
      else current += char
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (/\s/.test(char)) {
      if (current) {
        out.push(current)
        current = ''
      }
    } else {
      current += char
    }
  }
  if (escaped) current += '\\'
  if (quote) throw new Error('Unclosed quote in $VISUAL or $EDITOR')
  if (current) out.push(current)
  return out
}
