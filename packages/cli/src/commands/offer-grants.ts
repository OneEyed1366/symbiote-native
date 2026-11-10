import pc from 'picocolors';
import { CliUsageError } from '../errors.js';
import type { IExpoPackageLayer } from '../expo-package-layers.js';
import {
  applyBundle,
  discoveredBundlesFromLayers,
  type IDiscoveredBundle,
} from '../grant-bundles.js';
import { resolveGrantSelection } from '../prompts.js';
import { printGrantedNotes } from './grant-summary.js';

type IGrantAnswer = {
  readonly granted: IDiscoveredBundle[];
  readonly wasAsked: boolean;
};

// `resolveGrantSelection` fails fast when there is no terminal to ask in (piped stdin, CI)
// That must not abort `new` or `add`, which fall through to the printed hint instead
async function askForGrants(
  candidates: readonly IDiscoveredBundle[],
): Promise<IGrantAnswer> {
  try {
    return {
      granted: await resolveGrantSelection(candidates),
      wasAsked: true,
    };
  } catch (error) {
    if (!(error instanceof CliUsageError)) throw error;
    return { granted: [], wasAsked: false };
  }
}

// Offered here, not only under `grant`, as printing a command to run later is bad DX
// `applyBundle` needs only the app's AndroidManifest.xml, which exists, so it applies at once
// Returns the lines for the outro
export async function offerGrants(
  root: string,
  grantable: readonly IExpoPackageLayer[],
): Promise<string[]> {
  if (grantable.length === 0) return [];
  const { granted, wasAsked } = await askForGrants(
    discoveredBundlesFromLayers(grantable),
  );

  if (granted.length > 0) {
    for (const entry of granted) applyBundle(root, entry.bundle);
    printGrantedNotes(granted);
    return [
      '',
      `Granted: ${granted.map(entry => entry.bundle.label).join(', ')}.`,
    ];
  }
  if (wasAsked) return [];
  const verb = grantable.length === 1 ? 'offers' : 'offer';
  return [
    '',
    `${grantable.map(layer => layer.label).join(', ')} also ${verb} optional, policy-sensitive Android permissions — after installing:`,
    ...grantable.map(layer =>
      pc.dim(`  npx @symbiote-native/cli grant ${layer.id}`),
    ),
  ];
}
