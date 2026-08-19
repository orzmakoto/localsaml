import { readFileSync } from 'node:fs'
import type { SpDef } from './config.js'
import { cyan, info } from './ui.js'

export function printIdpSettings(
  idp: NonNullable<SpDef['idp']>,
  opts: { metadata?: boolean; heading?: boolean; inline?: boolean } = {},
): void {
  if (opts.heading !== false) {
    info('Configure your SP with these IdP values:')
    console.log()
  }
  const fields = [
    ['entityId', idp.entityId],
    ['ssoUrl', idp.ssoUrl],
    ...(opts.metadata ? [['metadataFile', idp.metadataFile]] : []),
  ]
  if (opts.inline) {
    const width = Math.max(...fields.map(([label]) => label.length))
    for (const [label, value] of fields) {
      console.log(`${cyan(label.padEnd(width))}  ${value}`)
    }
    console.log()
  } else {
    for (const [label, value] of fields) printField(`idp.${label}`, value)
  }
  console.log(cyan('CERTIFICATE (PEM)'))
  console.log(readFileSync(idp.certificateFile, 'utf8').replace(/\r\n/g, '\n').trim())
}

function printField(label: string, value: string): void {
  console.log(`${cyan(label)}\n${value}\n`)
}
