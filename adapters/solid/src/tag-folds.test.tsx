// Which prop KEYS a Solid tag commits.
//
// The defect class, found on Angular 2026-08-31 and invisible to every suite: a tag inherits
// nothing a component wrapper used to do — no prop defaults, no alias renames, no bag folds.
// Angular's `text` lost `ellipsizeMode: 'tail'` and `allowFontScaling: true` (text truncated with
// no ellipsis) and `id -> nativeID` never applied, so `id` reached Fabric as an unknown key. Totals
// matched for a day and said nothing — only the KEY NAMES differed.
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

  // THE TWO TEXT CASES LEFT ON 2026-09-18 — `ellipsizeMode: 'tail'` / `allowFontScaling: true`, and
  // the null that had to resolve the same way. They are not a key this adapter produces any more:
  // the rule is the engine's, keyed on the component, and both claims live in
  // `core/engine/cpp/tests/js/committed-payload.itest.ts` against a real payload. Asserting them
  // here would now be asserting the headless builder's behaviour, which does not have the rule — a
  // false green in the opposite direction from the one this file's header describes.
  //
  // What this adapter still owes on a text tag is FORWARDING, and that is
  // `renderer-text-props.test.ts`.
});
