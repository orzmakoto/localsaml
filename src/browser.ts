import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { platform } from 'node:os'

/** Chromium-family only: `--user-data-dir` is what makes personas independent. */
const CANDIDATES: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/bin/brave-browser',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
}

export function findBrowser(explicit?: string): string {
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`browser not found: ${explicit}`)
    return explicit
  }
  const found = (CANDIDATES[platform()] ?? []).find((p) => existsSync(p))
  if (!found) {
    throw new Error(
      'No Chromium-based browser found. Set browser.command in the SP config.\n' +
        'Firefox and Safari are not supported: they have no --user-data-dir equivalent.',
    )
  }
  return found
}

export interface LaunchOptions {
  url: string
  isolated?: boolean
  profile?: string
  command?: string
  ignoreCertErrors?: boolean
}

export function launch(opts: LaunchOptions): void {
  if (!opts.isolated) {
    launchDefault(opts.url)
    return
  }
  if (!opts.profile) throw new Error('isolated browser launch needs a profile directory')
  mkdirSync(opts.profile, { recursive: true })
  const args = [
    `--user-data-dir=${opts.profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    // A dedicated throwaway profile, so relaxing this is contained to it.
    ...(opts.ignoreCertErrors ? ['--ignore-certificate-errors'] : []),
    opts.url,
  ]
  const child = spawn(findBrowser(opts.command), args, {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
}

/** Open a URL with the operating system's standard browser. */
function launchDefault(url: string): void {
  const os = platform()
  const command = os === 'darwin' ? 'open' : os === 'win32' ? 'cmd.exe' : 'xdg-open'
  const args = os === 'win32' ? ['/d', '/s', '/c', 'start', '""', url] : [url]
  const child = spawn(command, args, { detached: true, stdio: 'ignore' })
  child.unref()
}
