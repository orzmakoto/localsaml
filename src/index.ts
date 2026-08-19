#!/usr/bin/env node
import { Command } from 'commander'
import { init } from './commands/init.js'
import { add } from './commands/add.js'
import { open } from './commands/open.js'
import { list } from './commands/list.js'
import { show } from './commands/show.js'
import { edit } from './commands/edit.js'
import { remove } from './commands/remove.js'
import { fail } from './ui.js'

const program = new Command()

program
  .name('localsaml')
  .description('A throwaway SAML IdP for local development.\nDefine an SP and its users in one YAML, then open a logged-in browser.')
  .version('0.1.0')

program
  .command('init')
  .description('initialise config, IdP files, presets, and sample profile')
  .action((o) => init({ ...program.opts(), ...o }))

program
  .command('add <name>')
  .description('create an SP profile')
  .option('--acs <url>', 'ACS URL')
  .option('--entity-id <id>', 'SP entityID')
  .option('--preset <name>', 'attribute preset from presets.yaml')
  .option('-i, --interactive', 'prompt for missing SP settings')
  .action((name, o) => add(name, { ...program.opts(), ...o }))

program
  .command('open [args...]')
  .description('start a session: localsaml open [sp] [user...]')
  .option('--to <path>', 'where to land after login (RelayState)')
  .option('--isolated', 'use a dedicated Chromium profile for this SP and user')
  .option('--browser <path>', 'Chromium executable (implies --isolated)')
  .option('--print', 'print the signed SAML Response instead of opening a browser')
  .action((args, o) => open(args, { ...program.opts(), ...o }))

program
  .command('list')
  .alias('ls')
  .description('list profile names and SP entity IDs')
  .action((o) => list({ ...program.opts(), ...o }))

program
  .command('show <profile>')
  .description('show IdP settings for an SP profile')
  .action((profile, o) => show(profile, { ...program.opts(), ...o }))

program
  .command('edit <profile>')
  .description('open an SP profile in $VISUAL or $EDITOR')
  .action((profile, o) => edit(profile, { ...program.opts(), ...o }))

program
  .command('remove <profile>')
  .alias('rm')
  .description('remove an SP profile YAML')
  .action((profile, o) => remove(profile, { ...program.opts(), ...o }))

async function main() {
  try {
    await program.parseAsync(process.argv)
  } catch (err) {
    // Ctrl-C inside a prompt shouldn't print a stack trace.
    if (err instanceof Error && err.name === 'ExitPromptError') process.exit(130)
    fail(err instanceof Error ? err.message : String(err))
  }
}

main()
