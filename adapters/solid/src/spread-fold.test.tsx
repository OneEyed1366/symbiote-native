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
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const fabric = installFabric();
const TARGET = 'spread-parity';
let nextRoot = 9200;

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

function find(node: IFakeNode): IFakeNode | undefined {
  if (node.props.testID === TARGET) return node;
  for (const child of node.children) {
    const hit = find(child);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

async function committed(
  render: () => unknown,
): Promise<Record<string, unknown>> {
  const root = (nextRoot += 1);
  mount(root, render as never);
  await flush();
  const hit = fabric.committed.map(find).find(n => n !== undefined);
  if (hit === undefined) throw new Error('nothing committed');
  const props = { ...hit.props };
  unmount(root);
  return props;
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
