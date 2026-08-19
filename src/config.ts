import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename } from 'node:path'
import { parse } from 'yaml'
import { paths } from './paths.js'
import { NAME_FORMAT, type NameFormatKey, type SemanticKey } from './presets.js'

export const SP_ENTITY_ID_PLACEHOLDER = 'CHANGE_ME_SP_ENTITY_ID'
export const ACS_URL_PLACEHOLDER = 'CHANGE_ME_ACS_URL'

export interface RawAttr {
  name: string
  value: string | string[]
  nameFormat?: NameFormatKey
  friendlyName?: string
}

/** `undefined` = not specified; `null` = deliberately omit the attribute. */
export type Val = string | string[] | null | undefined

export interface UserDef {
  extends?: string
  nameId?: string
  nameIdFormat?: string
  /** Where to land after login, sent as RelayState. */
  to?: string
  email?: Val
  familyName?: Val
  givenName?: Val
  displayName?: Val
  department?: Val
  employeeId?: Val
  groups?: Val
  raw?: RawAttr[]
}

export interface SpDef {
  name: string
  preset?: string
  /** IdP values to configure on the SP side. */
  idp?: {
    entityId: string
    metadataFile: string
    privateKeyFile: string
    certificateFile: string
    ssoUrl: string
  }
  sp: { entityId: string; acsUrl: string; startUrl?: string }
  sign?: 'assertion' | 'response' | 'both'
  nameIdFormat?: string
  defaultUser?: string
  /** Attributes layered onto every user for this SP (tenant id, and so on). */
  attributes?: Omit<UserDef, 'extends'>
  /** Complete user definitions for this SP. */
  users?: Record<string, UserDef>
  browser?: { isolated?: boolean; command?: string; ignoreCertErrors?: boolean }
}

export interface RootConfig {
  version?: number
  idp?: { entityId?: string; ssoUrl?: string }
}

export const DEFAULT_IDP_ENTITY_ID = 'urn:localsaml:idp'

/**
 * The SSO URL is never reached — nothing is listening. Make the URL itself the
 * error message for anyone who stumbles into an SP-initiated redirect.
 * `.invalid` is reserved, so a stray request can never leave the machine.
 */
export const DUMMY_SSO_URL =
  'http://sso-not-used.localsaml.invalid/run-localsaml-open-instead'

export const NAMEID_FORMAT_EMAIL =
  'urn:oasis:names:tc:SAML:2.0:nameid-format:emailAddress'

const SEMANTIC: SemanticKey[] =
  ['email', 'familyName', 'givenName', 'displayName', 'department', 'employeeId', 'groups']

export function loadRoot(home: string): RootConfig {
  const p = paths(home).config
  return existsSync(p) ? (parse(readFileSync(p, 'utf8')) ?? {}) : {}
}

export function listSps(home: string): string[] {
  if (!existsSync(home)) return []
  return readdirSync(home)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .map((f) => basename(f, f.endsWith('.yaml') ? '.yaml' : '.yml'))
    .sort()
}

export function loadSp(home: string, name: string, validate = true): SpDef {
  const p = paths(home).sp(name)
  if (!existsSync(p)) throw new Error(`SP config not found: ${name} (${p})`)
  const def = parse(readFileSync(p, 'utf8')) as SpDef
  if (validate) {
    if (!def?.sp?.acsUrl) throw new Error(`${name}.yaml is missing sp.acsUrl`)
    if (!def?.sp?.entityId) throw new Error(`${name}.yaml is missing sp.entityId`)
    if (def.sp.entityId === SP_ENTITY_ID_PLACEHOLDER) {
      throw new Error(`${name}.yaml: replace sp.entityId (${SP_ENTITY_ID_PLACEHOLDER})`)
    }
    if (def.sp.acsUrl === ACS_URL_PLACEHOLDER) {
      throw new Error(`${name}.yaml: replace sp.acsUrl (${ACS_URL_PLACEHOLDER})`)
    }
  }
  return { ...def, name }
}

/** Follow `extends` chains inside one SP's `users` map. */
export function resolveUser(
  users: Record<string, UserDef>,
  name: string,
  seen = new Set<string>(),
): UserDef {
  const def = users[name]
  if (!def) throw new Error(`user not found in SP config: ${name}`)
  if (!def.extends) return def
  if (seen.has(name)) throw new Error(`circular extends at user: ${name}`)
  seen.add(name)
  const base = resolveUser(users, def.extends, seen)
  const { extends: _drop, ...own } = def
  return { ...base, ...own, raw: [...(base.raw ?? []), ...(own.raw ?? [])] }
}

/** SP-wide attributes are the base; the resolved user wins on conflicts. */
export function composeUser(sp: SpDef, name: string): UserDef {
  const all = sp.attributes ?? {}
  const own = resolveUser(sp.users ?? {}, name)
  return {
    ...all,
    ...own,
    raw: [...(all.raw ?? []), ...(own.raw ?? [])],
  }
}

export interface WireAttr {
  name: string
  nameFormat: string
  friendlyName?: string
  values: string[]
}

/** Turn a composed user into the attributes that go on the wire. */
export function toWireAttributes(
  user: UserDef,
  preset: import('./presets.js').Preset,
): WireAttr[] {
  const out: WireAttr[] = []
  for (const key of SEMANTIC) {
    const v = user[key]
    if (v === undefined || v === null) continue // null = deliberately absent
    const m = preset.map[key]
    if (!m) continue
    out.push({
      name: m.name,
      friendlyName: m.friendlyName,
      nameFormat: NAME_FORMAT[preset.nameFormat],
      values: Array.isArray(v) ? v : [v],
    })
  }
  for (const r of user.raw ?? []) {
    out.push({
      name: r.name,
      friendlyName: r.friendlyName,
      nameFormat: NAME_FORMAT[r.nameFormat ?? 'basic'],
      values: Array.isArray(r.value) ? r.value : [r.value],
    })
  }
  return out
}

export function nameIdOf(user: UserDef, name: string): string {
  if (user.nameId) return user.nameId
  if (typeof user.email === 'string') return user.email
  throw new Error(`user "${name}" needs a nameId or an email`)
}
