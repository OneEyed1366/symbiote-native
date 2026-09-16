// A SPREAD still reaches the runtime prop fold. `<view {...bag} />` is a shape apps write
// constantly, and the renderer's `foldAliasKey` (`renderer.ts`, in `setProperty`) sees every key
// whatever shape it arrived in — so `id` must still leave as `nativeID`.
//
// Asserted on the COMMITTED payload: the fold runs on the way to Fabric, so reading the node would
// pass whether or not it ran.
//
// This file used to carry TWO arms, a component and a tag, and both were spelled `<view {...BAG} />`
// — the comparison measured nothing (`test-harness-false-greens.md` §12).
import { describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const TARGET = 'spread-parity';
let nextRoot = 9200;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

// Reset per case: every case opens its OWN surface, and `appRoot()` searches the creation log, so
// without this it answers with the FIRST case's root for the rest of the file.
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
  if (hit === undefined) throw new Error('nothing committed');
  const payload = { ...hit.payload };
  unmount(root);
  return payload;
}

const BAG = { id: 'anchor', testID: TARGET, accessible: true };

describe('a spread on a tag', () => {
  it('commits every key in the bag', async () => {
    const props = await committed(() => <view {...BAG} />);

    expect(props.testID).toBe(TARGET);
    expect(props.accessible).toBe(true);
  });

  it('folds id to nativeID through the spread', async () => {
    const props = await committed(() => <view {...BAG} />);

    expect(props.nativeID).toBe('anchor');
    expect(Object.keys(props)).not.toContain('id');
  });
});
