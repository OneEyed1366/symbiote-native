// Which prop KEYS a Solid tag commits.
//
// The defect class, invisible to a count-only suite: a tag inherits nothing a component wrapper
// does automatically — no prop defaults, no alias renames, no bag folds. A missing
// `ellipsizeMode` or an `id` that never became `nativeID` commits the same key COUNT as correct.
//
// So the expectations below are ABSOLUTE and name the value the fold PRODUCES. This file used to
// mount two arms and compare them, and both were spelled as the same tag — a comparison that
// measures nothing (`test-harness-false-greens.md` §12); an expectation restating the input would
// be the same false green one level down.
import { describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const TARGET = 'fold-parity';
let nextRoot = 8100;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

/**
 * The committed payload of the one tagged node, after a full mount+commit.
 *
 * Reset per case: every case opens its OWN surface, and `appRoot()` searches the creation log, so
 * without this it answers with the FIRST case's root for the rest of the file.
 */
async function committed(
  render: () => unknown,
): Promise<Record<string, unknown>> {
  fabric.reset();
  const root = (nextRoot += 1);
  mount(root, render as never);
  await flush();
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === TARGET,
  );
  if (hit === undefined)
    throw new Error('nothing committed with the target testID');
  const payload = { ...hit.payload };
  unmount(root);
  return payload;
}

describe('the folds a tag commits', () => {
  it('view — id folds to nativeID', async () => {
    const props = await committed(() => <view id="anchor" testID={TARGET} />);

    expect(props.nativeID).toBe('anchor');
    expect(Object.keys(props)).not.toContain('id');
  });

  it('view — no id leaves no nativeID key', async () => {
    const props = await committed(() => <view testID={TARGET} />);

    expect(Object.keys(props)).not.toContain('nativeID');
  });

  // `ellipsizeMode: 'tail'` / `allowFontScaling: true` are not a key this adapter produces: the
  // rule is the engine's, keyed on the component (`committed-payload.itest.ts`, against a real
  // payload). Asserting them here would assert the headless builder, which has no rule to test.

  // What this adapter still owes on a text tag is FORWARDING — `renderer-text-props.test.ts`.
});
