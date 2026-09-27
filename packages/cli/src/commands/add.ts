import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { addLayersToApp } from '../add-layers.js';
import type { IParsedCommand } from '../cli.js';
import { detectAddedLayers } from '../detect-added-layers.js';
import {
  detectSymbioteFrameworkFromDependencies,
  readCwdDependencies,
} from '../detect-framework.js';
import { CliUsageError, NotSymbioteAppError } from '../errors.js';
import { expoPackagesWithOptionalManifestBundles } from '../expo-package-layers.js';
import { getCommand } from '../get-command.js';
import {
  applyBundle,
  discoveredBundlesFromLayers,
  type IDiscoveredBundle,
} from '../grant-bundles.js';
import {
  explicitLayersFromFlags,
  resolveAddLayers,
  resolveAddOverwrite,
  resolveGrantSelection,
  resolvePackageManager,
} from '../prompts.js';
import type { IFramework } from '../types.js';
import { printGrantedNotes } from './grant-summary.js';

type IAddCommand = Extract<IParsedCommand, { kind: 'add' }>;

// `add` extends an EXISTING @symbiote-native/* app — it does not bootstrap symbiote into a plain
// RN project (that would mean reconciling native files against real, already-customized project
// state with no safe way to do it; see `new` for scaffolding one from scratch). So unlike every
// other resolver in prompts.ts, this has no interactive fallback: no @symbiote-native/<adapter>
// dependency means there is nothing for `add` to extend, in any terminal.
export function resolveFrameworkForAdd(
  explicit: IFramework | undefined,
  cwd: string = process.cwd(),
): IFramework {
  const detected = detectSymbioteFrameworkFromDependencies(
    readCwdDependencies(cwd),
  );
  if (detected === undefined) throw new NotSymbioteAppError();

  if (explicit !== undefined && explicit !== detected) {
    throw new CliUsageError(
      `--framework ${explicit} was given, but this project's package.json declares ` +
        `@symbiote-native/${detected} — pass --framework ${detected} or omit the flag.`,
    );
  }
  return detected;
}

export async function runAdd(parsed: IAddCommand): Promise<void> {
  clack.intro('@symbiote-native/cli add');

  const cwd = process.cwd();
  const framework = resolveFrameworkForAdd(parsed.framework, cwd);
  const alreadyAdded = detectAddedLayers(readCwdDependencies(cwd));
  const layerFlags = {
    hasExpoModules: parsed.hasExpoModules,
    hasNavigation: parsed.hasNavigation,
    hasTesting: parsed.hasTesting,
    hasSlider: parsed.hasSlider,
    hasSplashScreen: parsed.hasSplashScreen,
    expoPackages: parsed.expoPackages,
  };

  const layers = await resolveAddLayers(
    layerFlags,
    alreadyAdded,
    parsed.hasForce,
  );

  // Layers named by an explicit flag but dropped because they're already present (and --force
  // wasn't given) — reported distinctly from `result.skippedLayers` below, which is only ever
  // 'testing' declining a file overwrite.
  const alreadyPresentSkips = parsed.hasForce
    ? []
    : explicitLayersFromFlags(layerFlags).filter(layer =>
        alreadyAdded.has(layer),
      );

  if (layers.length === 0) {
    const outro =
      alreadyPresentSkips.length > 0
        ? `Nothing to add — already present: ${alreadyPresentSkips.join(', ')}.`
        : 'Nothing to add — every optional layer @symbiote-native/cli offers is already present.';
    clack.outro(outro);
    return;
  }

  const result = await addLayersToApp({
    root: cwd,
    framework,
    layers,
    confirmTestingOverwrite: () =>
      resolveAddOverwrite(
        parsed.hasForce,
        '"detox.config.js" / "e2e/" already exist. Overwrite them?',
      ),
  });

  const lines: string[] = [];

  if (result.appliedLayers.length > 0) {
    const packageManager = await resolvePackageManager(parsed.packageManager);
    lines.push(
      `Added: ${result.appliedLayers.join(', ')}.`,
      '',
      pc.bold(pc.green(`  ${getCommand(packageManager, 'install')}`)),
    );
  }
  const allSkips = [...alreadyPresentSkips, ...result.skippedLayers];
  if (allSkips.length > 0) {
    lines.push(
      '',
      `Skipped (already present, left untouched): ${allSkips.join(', ')}.`,
    );
  }
  // navigation deliberately never touches App source (see add-layers.ts) — the developer wires
  // the Stack in themselves, so this is the one manual step `add` can't do for them.
  if (result.appliedLayers.includes('navigation')) {
    lines.push(
      '',
      'Wire it up in your App entry:',
      pc.dim(
        `  import { Stack } from '@symbiote-native/navigation/${framework}';`,
      ),
    );
  }
  // Offered here — not just documented under a separate `grant` command the developer has to
  // already know about — because printing a command to run later is bad DX. applyBundle only
  // needs the app's own AndroidManifest.xml, which already exists; it doesn't need the package to
  // be installed yet, so this can apply the developer's choice immediately.
  const grantable = expoPackagesWithOptionalManifestBundles(
    new Set(result.appliedLayers),
  );
  if (grantable.length > 0) {
    const candidates = discoveredBundlesFromLayers(grantable);
    let granted: IDiscoveredBundle[] = [];
    let asked = false;
    try {
      granted = await resolveGrantSelection(candidates);
      asked = true;
    } catch (error) {
      // resolveGrantSelection's own documented contract: it fails fast when there is no terminal
      // to ask in (piped stdin, CI) — that must not abort the rest of `add`, just fall through to
      // the printed hint below so the developer still hears about it.
      if (!(error instanceof CliUsageError)) throw error;
    }

    if (granted.length > 0) {
      for (const entry of granted) applyBundle(cwd, entry.bundle);
      printGrantedNotes(granted);
      lines.push(
        '',
        `Granted: ${granted.map(entry => entry.bundle.label).join(', ')}.`,
      );
    } else if (!asked) {
      lines.push(
        '',
        `${grantable.map(layer => layer.label).join(', ')} also offer${grantable.length === 1 ? 's' : ''} optional, policy-sensitive Android permissions — after installing:`,
        ...grantable.map(layer =>
          pc.dim(`  npx @symbiote-native/cli grant ${layer.id}`),
        ),
      );
    }
  }
  clack.outro(lines.length > 0 ? lines.join('\n') : 'Nothing changed.');
}
