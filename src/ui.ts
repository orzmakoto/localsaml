const on = process.stdout.isTTY && !process.env.NO_COLOR
const w = (code: string) => (s: string) => (on ? `\x1b[${code}m${s}\x1b[0m` : s)

export const dim = w('2')
export const bold = w('1')
export const green = w('32')
export const yellow = w('33')
export const cyan = w('36')

export const ok = (msg: string) => console.log(`${green('✔')} ${msg}`)
export const info = (msg: string) => console.log(`${cyan('ℹ')} ${msg}`)
export const warn = (msg: string) => console.log(`${yellow('!')} ${msg}`)
export const note = (msg: string) => console.log(`  ${dim(msg)}`)

export function fail(msg: string): never {
  console.error(`\x1b[31m✖\x1b[0m ${msg}`)
  process.exit(1)
}
