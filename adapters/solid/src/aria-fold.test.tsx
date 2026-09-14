// The aria fold lives in the engine (`core/engine/src/accessibility-props.ts`, called from
// `fabricProps`), and this proves a Solid tag reaches it: `role` / `aria-*` must arrive folded, with
// the raw keys gone. If they do not, accessibility silently breaks on device — nothing here is
// visible to a JS smoke.
//
// Asserted on the COMMITTED payload, not on node.props: the fold runs inside `fabricProps`, so
// reading the node would pass whether or not it ran. Shape borrowed from
// `core/engine/src/__tests__/aria-fold.test.ts`, which proves the fold itself; this proves Solid
// reaches it.
//
// This file used to carry TWO arms, a component and a tag, and both were spelled `<view>` — the
// comparison measured nothing (`test-harness-false-greens.md` §12) and the absolute expectations
// were always the whole oracle. Only the duplicate went.
import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';

const fabric = installFabric();
const TARGET = 'aria-parity';
let nextRoot = 8300;

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

describe('the aria fold reaches a Solid tag', () => {
  it('role + aria-label fold, and the raw keys are gone', async () => {
    const props = await committed(() => (
      <view testID={TARGET} role="button" aria-label="x" />
    ));

    expect(props.accessibilityRole).toBe('button');
    expect(props.accessibilityLabel).toBe('x');
    expect(Object.keys(props)).not.toContain('role');
    expect(Object.keys(props)).not.toContain('aria-label');
  });

  // The two rules point OPPOSITE ways, which is what a copy-by-analogy collapses.
  it('scalar: the explicit prop wins over the alias', async () => {
    const props = await committed(() => (
      <view testID={TARGET} accessibilityLabel="explicit" aria-label="alias" />
    ));
    expect(props.accessibilityLabel).toBe('explicit');
  });

  it('composite: the alias wins PER FIELD inside accessibilityState', async () => {
    const props = await committed(() => (
      <view
        testID={TARGET}
        accessibilityState={{ checked: false, busy: true }}
        aria-checked={true}
      />
    ));

    expect(props.accessibilityState).toEqual({ checked: true, busy: true });
  });

  // The discriminator, in place of breaking the shared engine file. The fold rewrites the keys it
  // KNOWS and leaves the rest alone, so a key outside its list must survive verbatim. If the fold
  // were not running at all, `role` would survive the same way — so this case failing and the cases
  // above passing cannot both happen by accident, and a payload that simply forwards everything is
  // ruled out.
  it('leaves an aria key the fold does not handle untouched', async () => {
    const props = await committed(() => (
      <view testID={TARGET} role="button" aria-nonsense="keep" />
    ));
    expect(props.accessibilityRole).toBe('button');
    expect(Object.keys(props)).not.toContain('role');
    expect(props['aria-nonsense']).toBe('keep');
  });
});
