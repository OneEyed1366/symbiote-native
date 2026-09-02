// React is the ONLY adapter where the aria fold runs twice, and this is the file that proves the
// second pass is a no-op.
//
// The fold moved into the engine (`core/engine/src/accessibility-props.ts`, called from
// `fabricProps`) so that a LOWERED element gets it — a lowered element has no component wrapper to
// run it in. React never lowers, so its wrapper still calls `resolveAccessibilityProps` on the way
// in, and the engine then folds the same bag again on the way to Fabric.
//
// That is safe only because pass 1 BLANKS every alias, so pass 2's gate reports nothing to do and
// returns its input by identity. `core/components/src/accessibility-props.test.ts` asserts that
// property on the function; this asserts it end to end through a real adapter, which is the only
// place a double pass can actually happen.
//
// WHY IT NEEDED ITS OWN FILE. React's existing accessibility assertions
// (`components/pressable/pressable.test.tsx`) set `accessibilityRole` DIRECTLY — through Button's
// own mapping — so none of them travels the alias path at all. The whole adapter was green
// throughout the move without exercising the thing that moved.
import { describe, expect, it } from 'vitest';
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 118;
const fabric = installFabric();

function committed(testID: string): IFakeNode | undefined {
  const walk = (nodes: readonly IFakeNode[]): IFakeNode | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node;
      const found = walk(node.children);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return walk(fabric.appRoot().children);
}

describe('the aria fold survives running twice through React', () => {
  it('folds role and aria-label, and leaves no alias in the payload', () => {
    mount(ROOT_TAG, <View testID="folded" role="button" aria-label="close" />);

    const props = committed('folded')?.props ?? {};
    expect(props.accessibilityRole).toBe('button');
    expect(props.accessibilityLabel).toBe('close');
    // Neither alias may survive. `fabricProps` copies unknown keys through verbatim, so a
    // surviving `role` rides to Fabric as a key no ViewConfig knows — which is exactly the defect
    // three of the four lowering transforms were shipping before the fold moved down.
    expect(Object.hasOwn(props, 'role')).toBe(false);
    expect(Object.hasOwn(props, 'aria-label')).toBe(false);
    unmount(ROOT_TAG);
  });

  // The case a double pass could actually corrupt: pass 1 writes the composite from the alias, and
  // a pass 2 that re-read the (now blanked) alias would overwrite the field with `undefined`.
  it('does not let the second pass blank a composite the first pass built', () => {
    mount(
      ROOT_TAG,
      <View
        testID="composite"
        accessibilityState={{ checked: false, busy: true }}
        aria-checked
      />,
    );

    // Inside a composite the ALIAS wins per field — the opposite of the scalar rule above, and the
    // pair is what a "simplification" of the fold collapses.
    const props = committed('composite')?.props ?? {};
    expect(props.accessibilityState).toEqual({
      busy: true,
      checked: true,
      disabled: undefined,
      expanded: undefined,
      selected: undefined,
    });
    unmount(ROOT_TAG);
  });
});
