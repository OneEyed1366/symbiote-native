import * as clack from '@clack/prompts';
import pc from 'picocolors';
import {
  explicitLayersFromFlags,
  resolveAddLayers,
  resolveAddOverwrite,
} from '../add-layer-prompts.js';
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
import { resolvePackageManager } from '../prompts.js';
import type { IAddLayerName, IFramework, IPackageManager } from '../types.js';
import { offerGrants } from './offer-grants.js';
import { reanimatedNotes } from './reanimated-notes.js';

type IAddCommand = Extract<IParsedCommand, { kind: 'add' }>;

// `add` extends an EXISTING @symbiote-native/* app, it does not bootstrap one into plain RN
// With no @symbiote-native/<adapter> dependency there is nothing to extend, so no prompt fallback
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

type IPickedLayers = {
  readonly layers: readonly IAddLayerName[];
  // Layers a flag named but that were dropped as already present, without --force
  // They are reported apart from `skippedLayers`, which only holds `testing` declining
  readonly alreadyPresentSkips: readonly IAddLayerName[];
};

async function pickLayers(
  parsed: IAddCommand,
  alreadyAdded: ReadonlySet<IAddLayerName>,
): Promise<IPickedLayers> {
  const layers = await resolveAddLayers(parsed, alreadyAdded, parsed.hasForce);
  const alreadyPresentSkips = parsed.hasForce
    ? []
    : explicitLayersFromFlags(parsed).filter(layer => alreadyAdded.has(layer));
  return { layers, alreadyPresentSkips };
}

function nothingToAddMessage(
  alreadyPresentSkips: readonly IAddLayerName[],
): string {
  return alreadyPresentSkips.length > 0
    ? `Nothing to add — already present: ${alreadyPresentSkips.join(', ')}.`
    : 'Nothing to add — every optional layer @symbiote-native/cli offers is already present.';
}

async function installLines(
  applied: readonly IAddLayerName[],
  requested: IPackageManager | undefined,
): Promise<string[]> {
  if (applied.length === 0) return [];
  const packageManager = await resolvePackageManager(requested);
  return [
    `Added: ${applied.join(', ')}.`,
    '',
    pc.bold(pc.green(`  ${getCommand(packageManager, 'install')}`)),
  ];
}

function skippedLines(skipped: readonly IAddLayerName[]): string[] {
  return skipped.length === 0
    ? []
    : ['', `Skipped (already present, left untouched): ${skipped.join(', ')}.`];
}

// `navigation` never touches App source, so wiring the Stack is the one step `add` cannot do
function navigationLines(
  applied: readonly IAddLayerName[],
  framework: IFramework,
): string[] {
  if (!applied.includes('navigation')) return [];
  return [
    '',
    'Wire it up in your App entry:',
    pc.dim(
      `  import { Stack } from '@symbiote-native/navigation/${framework}';`,
    ),
  ];
}

export async function runAdd(parsed: IAddCommand): Promise<void> {
  clack.intro('@symbiote-native/cli add');

  const cwd = process.cwd();
  const framework = resolveFrameworkForAdd(parsed.framework, cwd);
  const alreadyAdded = detectAddedLayers(readCwdDependencies(cwd));
  const { layers, alreadyPresentSkips } = await pickLayers(
    parsed,
    alreadyAdded,
  );

  if (layers.length === 0) {
    clack.outro(nothingToAddMessage(alreadyPresentSkips));
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

  const lines = [
    ...(await installLines(result.appliedLayers, parsed.packageManager)),
    ...skippedLines([...alreadyPresentSkips, ...result.skippedLayers]),
    ...navigationLines(result.appliedLayers, framework),
    ...(result.appliedLayers.includes('reanimated')
      ? reanimatedNotes(result.hasManualBabelStep)
      : []),
    ...(await offerGrants(
      cwd,
      expoPackagesWithOptionalManifestBundles(new Set(result.appliedLayers)),
    )),
  ];
  clack.outro(lines.length > 0 ? lines.join('\n') : 'Nothing changed.');
}
