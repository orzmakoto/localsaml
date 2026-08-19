import { listSps, loadSp } from '../config.js'
import { printIdpSettings } from '../idp-output.js'
import { paths, resolveHome } from '../paths.js'
import { idpSettings } from '../sample.js'
import { bold, cyan, dim, fail } from '../ui.js'

export function show(profile: string, _opts: object): void {
  const home = resolveHome()
  const known = listSps(home)
  if (!known.includes(profile)) {
    fail(`Unknown profile "${profile}". Known: ${known.join(', ') || '(none)'}`)
  }
  const sp = loadSp(home, profile, false)
  const file = paths(home).sp(profile)

  section('PROFILE')
  console.log(`${cyan('name')}  ${profile}`)
  console.log(`${cyan('path')}  ${file}`)
  console.log()

  section('IDP SETTINGS')
  printIdpSettings(sp.idp ?? idpSettings(home), { heading: false, inline: true })
}

function section(title: string): void {
  console.log(bold(title))
  console.log(dim('─'.repeat(title.length)))
}
