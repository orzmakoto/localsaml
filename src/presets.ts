import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parse, stringify } from 'yaml'
import { paths } from './paths.js'

/**
 * Users are written in terms of *meaning*; a preset decides what those
 * attributes are actually called on the wire, and with which NameFormat.
 * Switching preset is how you check "does our app still work if the customer
 * moves from Okta to Entra ID?" — something a real IdP cannot answer.
 */
export type SemanticKey =
  | 'email' | 'familyName' | 'givenName' | 'displayName'
  | 'department' | 'employeeId' | 'groups'

export const NAME_FORMAT = {
  unspecified: 'urn:oasis:names:tc:SAML:2.0:attrname-format:unspecified',
  basic: 'urn:oasis:names:tc:SAML:2.0:attrname-format:basic',
  uri: 'urn:oasis:names:tc:SAML:2.0:attrname-format:uri',
} as const

export type NameFormatKey = keyof typeof NAME_FORMAT

export interface Mapping {
  name: string
  friendlyName?: string
}

export interface Preset {
  nameFormat: NameFormatKey
  map: Partial<Record<SemanticKey, Mapping>>
}

const xmlsoap = (s: string) =>
  `http://schemas.xmlsoap.org/ws/2005/05/identity/claims/${s}`

export const DEFAULT_PRESETS: Record<string, Preset> = {
  /** Plain lowerCamel names — the safe default for an app you control. */
  generic: {
    nameFormat: 'basic',
    map: {
      email: { name: 'email' },
      familyName: { name: 'lastName' },
      givenName: { name: 'firstName' },
      displayName: { name: 'displayName' },
      department: { name: 'department' },
      employeeId: { name: 'employeeId' },
      groups: { name: 'groups' },
    },
  },

  /** Okta's conventional SAML app mapping. */
  okta: {
    nameFormat: 'unspecified',
    map: {
      email: { name: 'email' },
      familyName: { name: 'lastName' },
      givenName: { name: 'firstName' },
      displayName: { name: 'displayName' },
      department: { name: 'department' },
      employeeId: { name: 'employeeNumber' },
      groups: { name: 'groups' },
    },
  },

  /**
   * Microsoft Entra ID uses WS-Fed claim URIs. `department` has no fixed
   * default there — tenants pick the URI themselves — so this is the one
   * commonly configured; override it with `raw` if yours differs.
   */
  entra: {
    nameFormat: 'uri',
    map: {
      email: { name: xmlsoap('emailaddress') },
      familyName: { name: xmlsoap('surname') },
      givenName: { name: xmlsoap('givenname') },
      displayName: { name: 'http://schemas.microsoft.com/identity/claims/displayname' },
      department: { name: xmlsoap('department') },
      employeeId: { name: 'http://schemas.microsoft.com/identity/claims/employeeid' },
      groups: { name: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups' },
    },
  },

  /** LDAP/eduPerson OIDs, as Shibboleth and most academic IdPs send them. */
  shibboleth: {
    nameFormat: 'uri',
    map: {
      email: { name: 'urn:oid:0.9.2342.19200300.100.1.3', friendlyName: 'mail' },
      familyName: { name: 'urn:oid:2.5.4.4', friendlyName: 'sn' },
      givenName: { name: 'urn:oid:2.5.4.42', friendlyName: 'givenName' },
      displayName: { name: 'urn:oid:2.16.840.1.113730.3.1.241', friendlyName: 'displayName' },
      department: { name: 'urn:oid:2.5.4.11', friendlyName: 'ou' },
      employeeId: { name: 'urn:oid:2.16.840.1.113730.3.1.3', friendlyName: 'employeeNumber' },
      groups: { name: 'urn:oid:1.3.6.1.4.1.5923.1.5.1.1', friendlyName: 'isMemberOf' },
    },
  },
}

/** Write the built-in presets once; an existing user-edited file is preserved. */
export function ensurePresets(home: string): string {
  const resolved = paths(home)
  const file = resolved.presets
  if (!existsSync(file)) {
    mkdirSync(resolved.configDir, { recursive: true })
    writeFileSync(
      file,
      '# Attribute names and NameFormat values used by each SP preset.\n' +
        '# Edit these defaults or add your own preset. Existing files are never overwritten.\n' +
        stringify({ presets: DEFAULT_PRESETS }),
    )
  }
  return file
}

/** Load the editable preset catalog used at runtime. */
export function loadPresets(home: string): Record<string, Preset> {
  const file = ensurePresets(home)
  const document = parse(readFileSync(file, 'utf8'))
  const presets = document?.presets
  if (!presets || typeof presets !== 'object' || Array.isArray(presets)) {
    throw new Error(`${file} must contain a "presets" map`)
  }
  for (const [name, preset] of Object.entries(presets as Record<string, Partial<Preset>>)) {
    if (
      !preset ||
      !preset.map ||
      typeof preset.nameFormat !== 'string' ||
      !(preset.nameFormat in NAME_FORMAT)
    ) {
      throw new Error(
        `${file}: preset "${name}" needs nameFormat (${Object.keys(NAME_FORMAT).join(' | ')}) and map`,
      )
    }
  }
  return presets as Record<string, Preset>
}
