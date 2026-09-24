#!/usr/bin/env node
import pc from 'picocolors';
import { parseArgv } from './cli.js';
import { runAdd } from './commands/add.js';
import { runGrant } from './commands/grant.js';
import { runNew } from './commands/new.js';
import { CliUsageError, NotSymbioteAppError } from './errors.js';
import { EXPO_PACKAGE_LAYERS } from './expo-package-layers.js';
// A static JSON import, not fs/createRequire: rolldown resolves and inlines it (relative to
// this SOURCE file) into bundle.js at build time, so the published artifact needs no
// package.json lookup at runtime at all — unlike a runtime `require('../package.json')`, which
// breaks the moment the bundle no longer sits one directory level away from it (see git history).
import pkg from '../package.json' with { type: 'json' };

function printHelp(): void {
  const expoPackageFlags = EXPO_PACKAGE_LAYERS.map(
    layer => `--${layer.id}`,
  ).join(', ');
  console.log(`@symbiote-native/cli — scaffold a SymbioteNative app, or add it to an existing one.

Usage:
  npx @symbiote-native/cli new <app-name> [--framework react|vue|angular|solid|svelte] [--vue-flavor tsx|sfc]
                      [--javascript] [--force] [--bundle-id com.example.app]
                      [--styling css|css-modules|scss|less|stylus|stylesheet]
                      [--navigation] [--expo-modules] [--testing] [--splash-screen] [--slider] [--pm npm|pnpm|yarn]
                      [--<expo-package> ...]  (one per Expo-backed package, implies --expo-modules)
  npx @symbiote-native/cli add [--navigation] [--expo-modules] [--testing] [--splash-screen] [--slider]
                      [--<expo-package> ...] [--force] [--pm npm|pnpm|yarn]
                      (run inside an existing @symbiote-native/* app)
  npx @symbiote-native/cli grant [layer]
                      interactively opt into policy-sensitive Android permissions/services
                      (e.g. background location, audio recording) an installed package offers;
                      [layer] narrows to one package's short name, e.g. "grant location"

  npx @symbiote-native/cli --version   print the CLI version
  npx @symbiote-native/cli --help      print this message

<expo-package> flags: ${expoPackageFlags}

Flags left out of either command are asked for interactively.`);
}

async function main(): Promise<void> {
  const parsed = parseArgv(process.argv.slice(2));

  switch (parsed.kind) {
    case 'new':
      await runNew(parsed);
      return;
    case 'add':
      await runAdd(parsed);
      return;
    case 'grant':
      await runGrant(parsed);
      return;
    case 'help':
      printHelp();
      return;
    case 'version':
      console.log(pkg.version);
      return;
  }
}

main().catch((error: unknown) => {
  if (error instanceof CliUsageError) {
    console.error(pc.red(`@symbiote-native/cli: ${error.message}`));
    process.exitCode = 1;
    return;
  }
  if (error instanceof NotSymbioteAppError) {
    console.error(pc.red(`@symbiote-native/cli: ${error.message}`));
    process.exitCode = 1;
    return;
  }
  console.error(pc.red('@symbiote-native/cli: unexpected error'), error);
  process.exitCode = 1;
});
