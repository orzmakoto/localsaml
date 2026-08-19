import {
  DEFAULT_IDP_ENTITY_ID,
  DUMMY_SSO_URL,
  ACS_URL_PLACEHOLDER,
  SP_ENTITY_ID_PLACEHOLDER,
  loadRoot,
  type SpDef,
} from './config.js'
import { paths } from './paths.js'

export { ACS_URL_PLACEHOLDER, SP_ENTITY_ID_PLACEHOLDER }

/** IdP values an SP needs, rendered into every generated SP profile. */
export const idpSettings = (home: string): NonNullable<SpDef['idp']> => {
  const p = paths(home)
  const root = loadRoot(home)
  return {
    entityId: root.idp?.entityId ?? DEFAULT_IDP_ENTITY_ID,
    metadataFile: p.metadata,
    privateKeyFile: p.key,
    certificateFile: p.cert,
    ssoUrl: root.idp?.ssoUrl ?? DUMMY_SSO_URL,
  }
}

/** Starter personas shared by `init` and `add`. */
export const sampleUsers = (): NonNullable<SpDef['users']> => ({
  yamada: {
    email: 'yamada@example.com',
    familyName: '山田',
    givenName: '太郎',
    displayName: '山田 太郎',
    department: '開発部',
    employeeId: '10024',
    groups: ['admin'],
  },
  suzuki: {
    extends: 'yamada',
    email: 'suzuki@example.com',
    familyName: '鈴木',
    givenName: '花子',
    displayName: '鈴木 花子',
    employeeId: '10078',
    groups: ['member'],
  },
})
