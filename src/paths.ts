import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** `~/.config/localsaml` — always holds the home pointer and machine-local state. */
export const DEFAULT_DIR = join(homedir(), '.config', 'localsaml')

/** LOCALSAML_CONFIG_PATH overrides the default configuration directory. */
export function resolveHome(): string {
  return process.env.LOCALSAML_CONFIG_PATH
    ? resolve(process.env.LOCALSAML_CONFIG_PATH)
    : DEFAULT_DIR
}

export const paths = (home: string) => ({
  configDir: join(home, 'config'),
  config: join(home, 'config', 'config.yaml'),
  presets: join(home, 'config', 'presets.yaml'),
  sp: (name: string) => join(home, `${name}.yaml`),
  key: join(home, 'config', 'idp-key.pem'),
  cert: join(home, 'config', 'idp-cert.pem'),
  metadata: join(home, 'config', 'idp-metadata.xml'),
})

/**
 * Browser profiles are machine-local and huge, so they never live under the
 * config root — that root may be a git repository shared with the team.
 */
export const profileDir = (sp: string, user: string) =>
  join(DEFAULT_DIR, 'profiles', sp, user)
