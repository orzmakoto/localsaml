import { existsSync, readFileSync } from 'node:fs'
import { paths, profileDir, resolveHome } from '../paths.js'
import {
  composeUser, listSps, loadRoot, loadSp, nameIdOf,
  toWireAttributes, DEFAULT_IDP_ENTITY_ID, NAMEID_FORMAT_EMAIL,
} from '../config.js'
import { loadPresets } from '../presets.js'
import { buildSignedResponse, encodeResponse } from '../saml.js'
import { serveOnce } from '../server.js'
import { launch } from '../browser.js'
import { ok, info, note, bold, dim, fail } from '../ui.js'

export interface OpenOptions {
  to?: string
  isolated?: boolean
  browser?: string
  print?: boolean
}

export async function open(args: string[], opts: OpenOptions): Promise<void> {
  const home = resolveHome()
  const p = paths(home)
  if (!existsSync(p.config)) fail('Not initialised yet. Run: localsaml add <name>')

  const known = listSps(home)
  const explicitSp = !!args[0] && known.includes(args[0])
  const spName = explicitSp ? args[0] : known.length === 1 ? known[0] : undefined
  if (!spName) {
    fail(
      args[0]
        ? `Unknown SP "${args[0]}". Known: ${known.join(', ') || '(none)'}`
        : known.length
          ? `Multiple SPs configured. Choose one: ${known.join(', ')}`
          : 'No SP configured. Run: localsaml add <name>',
    )
  }

  const sp = loadSp(home, spName)
  const requested = (explicitSp ? args.slice(1) : args).filter(Boolean)
  const targets = requested.length ? requested : sp.defaultUser ? [sp.defaultUser] : []
  if (!targets.length) fail(`No user given and ${spName} has no defaultUser`)

  const presets = loadPresets(home)
  const preset = presets[sp.preset ?? 'entra']
  if (!preset) fail(`Unknown preset "${sp.preset}". Known: ${Object.keys(presets).join(', ')}`)

  const key = readFileSync(sp.idp?.privateKeyFile ?? p.key, 'utf8')
  const cert = readFileSync(sp.idp?.certificateFile ?? p.cert, 'utf8')
  const idpEntityId =
    sp.idp?.entityId ?? loadRoot(home).idp?.entityId ?? DEFAULT_IDP_ENTITY_ID

  const pending: Promise<void>[] = []
  const isolated = !!(
    opts.isolated ||
    opts.browser ||
    sp.browser?.isolated ||
    sp.browser?.command ||
    sp.browser?.ignoreCertErrors
  )

  for (const userName of targets) {
    const user = composeUser(sp, userName)
    const xml = buildSignedResponse({
      idpEntityId,
      spEntityId: sp.sp.entityId,
      acsUrl: sp.sp.acsUrl,
      nameId: nameIdOf(user, userName),
      nameIdFormat: user.nameIdFormat ?? sp.nameIdFormat ?? NAMEID_FORMAT_EMAIL,
      attributes: toWireAttributes(user, preset),
      sign: sp.sign ?? 'assertion',
      key,
      cert,
    })

    if (opts.print) {
      console.log(xml)
      continue
    }

    const { url, done } = await serveOnce({
      acsUrl: sp.sp.acsUrl,
      samlResponse: encodeResponse(xml),
      relayState: opts.to ?? user.to ?? sp.sp.startUrl,
      label: `${spName} × ${userName}`,
    })
    pending.push(done)

    launch({
      url,
      isolated,
      profile: isolated ? profileDir(spName, userName) : undefined,
      command: opts.browser ?? sp.browser?.command,
      ignoreCertErrors: sp.browser?.ignoreCertErrors ?? false,
    })
    ok(
      isolated
        ? `${bold(`${spName} × ${userName}`)} ${dim(`profile: ${profileDir(spName, userName)}`)}`
        : `${bold(`${spName} × ${userName}`)} ${dim('default browser')}`,
    )
  }

  if (opts.print) return

  await Promise.all(pending)

  if (isolated && sp.sp.acsUrl.startsWith('https://') && !sp.browser?.ignoreCertErrors) {
    console.log()
    info('Certificate warnings on an https SP?')
    note(`Set browser.ignoreCertErrors: true in ${p.sp(spName)}`)
    note('(safe here — the profile is disposable and used only by localsaml)')
  }
}
