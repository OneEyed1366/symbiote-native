import { findAppRoot } from '@symbiote-native/expo-modules-link';
import * as clack from '@clack/prompts';
import type { IParsedCommand } from '../cli.js';
import { NotSymbioteAppError } from '../errors.js';
import {
  applyBundle,
  discoverOptionalBundles,
  filterBundlesForLayer,
} from '../grant-bundles.js';
import { resolveGrantSelection } from '../prompts.js';
import { printGrantedNotes } from './grant-summary.js';

type IGrantCommand = Extract<IParsedCommand, { kind: 'grant' }>;

export async function runGrant(parsed: IGrantCommand): Promise<void> {
  clack.intro('@symbiote-native/cli grant');

  const appRoot = findAppRoot();
  if (!appRoot) throw new NotSymbioteAppError();

  const candidates = filterBundlesForLayer(
    discoverOptionalBundles(appRoot),
    parsed.layer,
  );

  if (candidates.length === 0) {
    clack.outro(
      parsed.layer === undefined
        ? 'Nothing to grant — no installed package declares an optional manifest bundle.'
        : `Nothing to grant for "${parsed.layer}" — it declares no optional manifest bundle, or isn't installed.`,
    );
    return;
  }

  const selected = await resolveGrantSelection(candidates);
  if (selected.length === 0) {
    clack.outro('Nothing granted.');
    return;
  }

  for (const entry of selected) applyBundle(appRoot, entry.bundle);
  printGrantedNotes(selected);

  clack.outro(
    `Granted: ${selected.map(entry => entry.bundle.label).join(', ')}.`,
  );
}
