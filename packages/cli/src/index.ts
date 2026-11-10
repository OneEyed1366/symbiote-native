#!/usr/bin/env node
import pc from 'picocolors';
import { COMMAND_ADD, COMMAND_GRANT, COMMAND_NEW, parseArgv } from './cli.js';
import { runAdd } from './commands/add.js';
import { runGrant } from './commands/grant.js';
import { runNew } from './commands/new.js';
import { CliUsageError, NotSymbioteAppError } from './errors.js';
import { EXPO_PACKAGE_LAYERS } from './expo-package-layers.js';
// A static JSON import, so rolldown inlines it into bundle.js at build time
// A runtime `require('../package.json')` would break once the bundle no longer sits one level away
import pkg from '../package.json' with { type: 'json' };

const HELP_USAGE = `@symbiote-native/cli — scaffold a SymbioteNative app, or add it to an existing one.

Usage:
  npx @symbiote-native/cli new <app-name> [--framework react|vue|angular|solid|svelte] [--vue-flavor tsx|sfc]
                      [--javascript] [--force] [--bundle-id com.example.app]
                      [--styling css|css-modules|scss|less|stylus|stylesheet]
                      [--navigation] [--expo-modules] [--testing] [--splash-screen] [--slider] [--reanimated]
                      [--pm npm|pnpm|yarn]
                      [--<expo-package> ...]  (one per Expo-backed package, implies --expo-modules)
  npx @symbiote-native/cli add [--navigation] [--expo-modules] [--testing] [--splash-screen] [--slider] [--reanimated]
                      [--<expo-package> ...] [--force] [--pm npm|pnpm|yarn]
                      (run inside an existing @symbiote-native/* app)
  npx @symbiote-native/cli grant [layer]
                      interactively opt into policy-sensitive Android permissions/services
                      (e.g. background location, audio recording) an installed package offers;
                      [layer] narrows to one package's short name, e.g. "grant location"

  npx @symbiote-native/cli --version   print the CLI version
  npx @symbiote-native/cli --help      print this message
`;

function printHelp(): void {
  const expoPackageFlags = EXPO_PACKAGE_LAYERS.map(
    layer => `--${layer.id}`,
  ).join(', ');
  process.stdout.write(
    `${HELP_USAGE}\n<expo-package> flags: ${expoPackageFlags}\n\nFlags left out of either command are asked for interactively.\n`,
  );
}

async function main(): Promise<void> {
  const parsed = parseArgv(process.argv.slice(2));

  switch (parsed.kind) {
    case COMMAND_NEW:
      await runNew(parsed);
      return;
    case COMMAND_ADD:
      await runAdd(parsed);
      return;
    case COMMAND_GRANT:
      await runGrant(parsed);
      return;
    case 'help':
      printHelp();
      return;
    case 'version':
      process.stdout.write(`${pkg.version}\n`);
  }
}

main().catch((error: unknown) => {
  if (error instanceof CliUsageError || error instanceof NotSymbioteAppError) {
    console.error(pc.red(`@symbiote-native/cli: ${error.message}`));
    process.exitCode = 1;
    return;
  }
  console.error(pc.red('@symbiote-native/cli: unexpected error'), error);
  process.exitCode = 1;
});
