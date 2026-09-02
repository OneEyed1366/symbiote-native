// Gate for removing REFUSAL_CATEGORIES.bagFold: with the aria fold moved into the engine
// (`core/engine/src/accessibility-props.ts`, called from `fabricProps`), a lowered element carrying
// `role` / `aria-*` must commit exactly what the component wrapper commits. If it does not, dropping
// the refusal silently breaks accessibility on device — nothing here is visible to a JS smoke.
//
// Both arms are asserted on the COMMITTED payload, not on node.props: the fold runs inside
// fabricProps, so reading the node would pass whether or not it ran. Shape borrowed from
// `core/engine/src/__tests__/aria-fold.test.ts`, which proves the fold itself; this proves the two
// Solid PATHS reach it.
//
// The lowered arm is written as a hand-typed `<symbiote-view>` ON PURPOSE. `vitest.config.ts`
// applies `vite-plugin-solid` WITHOUT the lowering plugin, so `<View>` in a test file stays a
// component whatever the transform would have done to it — an arm written as `<View role=…>` would
// test the wrapper twice and report parity it never checked. The intrinsic is exactly what the
// transform emits, so this is the lowered shape; that the transform emits it is the parity table's
// job (`lowering-parity.test.ts`, row `aria-bag-fold`), and the two together cover verdict + shape.
import { describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from './render';
import { View } from './components/view';

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

describe('aria fold reaches both Solid paths', () => {
  it('role + aria-label fold, and the raw keys are gone', async () => {
    const lowered = await committed(() => (
      <symbiote-view testID={TARGET} role="button" aria-label="x" />
    ));
    const component = await committed(() => (
      <View testID={TARGET} role="button" aria-label="x" />
    ));

    for (const arm of [lowered, component]) {
      expect(arm.accessibilityRole).toBe('button');
      expect(arm.accessibilityLabel).toBe('x');
      expect(Object.keys(arm)).not.toContain('role');
      expect(Object.keys(arm)).not.toContain('aria-label');
    }
    expect(Object.keys(lowered).sort()).toEqual(Object.keys(component).sort());
  });

  // The two rules point OPPOSITE ways, which is what a copy-by-analogy collapses.
  it('scalar: the explicit prop wins over the alias', async () => {
    const lowered = await committed(() => (
      <symbiote-view
        testID={TARGET}
        accessibilityLabel="explicit"
        aria-label="alias"
      />
    ));
    expect(lowered.accessibilityLabel).toBe('explicit');
  });

  it('composite: the alias wins PER FIELD inside accessibilityState', async () => {
    const render = (Tag: 'lowered' | 'component') =>
      Tag === 'lowered'
        ? () => (
            <symbiote-view
              testID={TARGET}
              accessibilityState={{ checked: false, busy: true }}
              aria-checked={true}
            />
          )
        : () => (
            <View
              testID={TARGET}
              accessibilityState={{ checked: false, busy: true }}
              aria-checked={true}
            />
          );

    const lowered = await committed(render('lowered'));
    const component = await committed(render('component'));

    for (const arm of [lowered, component]) {
      expect(arm.accessibilityState).toEqual({ checked: true, busy: true });
    }
  });

  // The gate's own discriminator, in place of breaking the shared engine file. The fold rewrites
  // the keys it KNOWS and leaves the rest alone, so a key outside its list must survive verbatim.
  // If the fold were not running at all, `role` would survive the same way — so this arm failing
  // and the arms above passing cannot both happen by accident, and a payload that simply forwards
  // everything is ruled out.
  it('leaves an aria key the fold does not handle untouched', async () => {
    const lowered = await committed(() => (
      <symbiote-view testID={TARGET} role="button" aria-nonsense="keep" />
    ));
    expect(lowered.accessibilityRole).toBe('button');
    expect(Object.keys(lowered)).not.toContain('role');
    expect(lowered['aria-nonsense']).toBe('keep');
  });
});
