import { existsSync, writeFileSync } from 'node:fs'
import { input, select } from '@inquirer/prompts'
import { stringify } from 'yaml'
import { paths, resolveHome } from '../paths.js'
import type { SpDef } from '../config.js'
import { loadPresets } from '../presets.js'
import {
  ACS_URL_PLACEHOLDER,
  SP_ENTITY_ID_PLACEHOLDER,
  idpSettings,
  sampleUsers,
} from '../sample.js'
import { init } from './init.js'
import { printIdpSettings } from '../idp-output.js'
import { ok, bold, dim, fail } from '../ui.js'

export interface AddOptions {
  acs?: string
  entityId?: string
  preset?: string
  interactive?: boolean
}

export async function add(name: string, opts: AddOptions): Promise<void> {
  let home = resolveHome()
  // Nobody should have to run `init` before their first useful command.
  if (!existsSync(paths(home).config)) {
    await init({ quiet: true })
    home = resolveHome()
  }

  const p = paths(home)
  if (existsSync(p.sp(name))) fail(`SP "${name}" already exists: ${p.sp(name)}`)
  const presets = loadPresets(home)

  const acsUrl = opts.acs ?? (opts.interactive
    ? await input({
        message: 'ACS URL (where the SP receives the assertion)',
        validate: (v) => /^https?:\/\//.test(v) || 'must be an http(s) URL',
      })
    : ACS_URL_PLACEHOLDER)
  const entityId = opts.entityId ?? (opts.interactive
    ? await input({
        message: 'SP entityID',
        default: new URL(acsUrl).origin + '/saml/metadata',
      })
    : SP_ENTITY_ID_PLACEHOLDER)
  const preset = opts.preset ?? (opts.interactive
    ? await select({
        message: 'Attribute preset (which IdP should we imitate?)',
        choices: Object.keys(presets).map((v) => ({ name: v, value: v })),
        default: 'generic',
      })
    : 'generic')

  const def: SpDef = {
    name,
    preset,
    idp: idpSettings(home),
    sp: { entityId, acsUrl },
    defaultUser: 'yamada',
    users: sampleUsers(),
  }
  const { name: _drop, ...body } = def

  writeFileSync(
    p.sp(name),
    `# localsaml SP configuration.\n` +
      `# Add or edit users in the 'users' map.\n` +
      stringify(body),
  )

  ok(`Registered ${bold(name)} → ${dim(p.sp(name))}`)
  console.log()
  printIdpSettings(def.idp!, { metadata: true })
  console.log()
  if (acsUrl === ACS_URL_PLACEHOLDER || entityId === SP_ENTITY_ID_PLACEHOLDER) {
    console.log(`Next: edit ${bold(p.sp(name))}`)
  } else {
    console.log(`Next: ${bold(`localsaml open ${name}`)}`)
  }
}
