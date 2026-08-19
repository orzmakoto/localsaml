import { resolveHome } from '../paths.js'
import { listSps, loadSp } from '../config.js'
import { bold, dim, cyan } from '../ui.js'

export function list(_opts: object): void {
  const home = resolveHome()
  const sps = listSps(home)
  if (!sps.length) console.log(dim('(no profiles)'))
  if (sps.length) {
    const rows = sps.map((profile) => ({
      profile,
      entityId: loadSp(home, profile, false).sp?.entityId ?? '-',
    }))
    const width = Math.max('PROFILE'.length, ...rows.map((row) => row.profile.length))
    console.log(`${bold('PROFILE'.padEnd(width))}  ${bold('SP ENTITY ID')}`)
    console.log(`${dim('─'.repeat(width))}  ${dim('─'.repeat('SP ENTITY ID'.length))}`)
    for (const row of rows) {
      console.log(`${cyan(row.profile.padEnd(width))}  ${dim(row.entityId)}`)
    }
  }
}
