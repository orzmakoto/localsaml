import { unlinkSync } from 'node:fs'
import { listSps } from '../config.js'
import { paths, resolveHome } from '../paths.js'
import { bold, dim, fail, ok } from '../ui.js'

/** Remove one SP profile. Browser data, keys, and shared IdP files stay intact. */
export function remove(profile: string, _opts: object): void {
  const home = resolveHome()
  const known = listSps(home)
  if (!known.includes(profile)) {
    fail(`Unknown profile "${profile}". Known: ${known.join(', ') || '(none)'}`)
  }

  const file = paths(home).sp(profile)
  unlinkSync(file)
  ok(`Removed ${bold(profile)} ${dim(file)}`)
}
