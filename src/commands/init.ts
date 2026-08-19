import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { stringify } from 'yaml'
import { DEFAULT_DIR, paths, resolveHome } from '../paths.js'
import { generateKeyPair, buildMetadata } from '../cert.js'
import { DEFAULT_IDP_ENTITY_ID, DUMMY_SSO_URL, loadRoot } from '../config.js'
import { ensurePresets } from '../presets.js'
import {
  ACS_URL_PLACEHOLDER,
  SP_ENTITY_ID_PLACEHOLDER,
  idpSettings,
  sampleUsers,
} from '../sample.js'
import { ok, info, bold } from '../ui.js'

export interface InitOptions {
  /** Set when `add` bootstraps a first-time setup, so it owns the next step. */
  quiet?: boolean
}

export async function init(opts: InitOptions): Promise<void> {
  const home = resolveHome()
  const p = paths(home)

  mkdirSync(p.configDir, { recursive: true })

  if (!existsSync(p.key)) {
    const { key, cert } = generateKeyPair()
    writeFileSync(p.key, key, { mode: 0o600 })
    writeFileSync(p.cert, cert)
    ok('Generated a key pair (once only — shared by every SP)')
  }

  if (!existsSync(p.config)) {
    writeFileSync(
      p.config,
      `version: 1\nidp:\n  entityId: ${DEFAULT_IDP_ENTITY_ID}\n  ssoUrl: ${DUMMY_SSO_URL}\n`,
    )
  }
  ensurePresets(home)
  if (!existsSync(p.sp('sample'))) {
    writeFileSync(
      p.sp('sample'),
      '# Starter SP profile. Edit the URLs and users for your application.\n' +
        stringify({
          preset: 'generic',
          idp: idpSettings(home),
          sp: {
            entityId: SP_ENTITY_ID_PLACEHOLDER,
            acsUrl: ACS_URL_PLACEHOLDER,
          },
          defaultUser: 'yamada',
          users: sampleUsers(),
        }),
    )
  }
  const certPem = (await import('node:fs')).readFileSync(p.cert, 'utf8')
  const root = loadRoot(home)
  writeFileSync(
    p.metadata,
    buildMetadata(certPem, root.idp?.entityId, root.idp?.ssoUrl),
  )

  ok(`Initialised ${bold(home)}`)
  info(`IdP metadata for your SP: ${p.metadata}`)
  info(`Editable attribute presets: ${p.presets}`)
  info(`Starter SP profile (edit required): ${p.sp('sample')}`)
  info(`Isolated browser profiles: ${DEFAULT_DIR}/profiles`)

  if (!opts.quiet) {
    console.log()
    console.log(`Next: edit ${bold(p.sp('sample'))}`)
    console.log(`      then run ${bold('localsaml open sample')}`)
  }
}
