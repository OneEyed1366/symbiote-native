// React is the ONLY adapter where the aria fold runs twice, and this is the file that proves the
// second pass is a no-op.
//
// The fold moved into the engine (`core/engine/src/accessibility-props.ts`, called from
// `fabricProps`) so that a bare tag gets it — a tag has no component wrapper to run it in. React's
// remaining wrappers still call `resolveAccessibilityProps` on the way in, and the engine then
// folds the same bag again on the way to Fabric.
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
import { beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 118;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// Both cases mount on the same tag, so the recording has to be cleared between them — otherwise
// appRoot() finds the FIRST case's surface, which is still in the creation log.
beforeEach(() => fabric.reset());

// The fold runs on the way into the payload, so both the search key and the assertions read
// `payload` rather than the author's bag.
function foldedPayload(testID: string): Record<string, unknown> {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  return hit?.payload ?? {};
}

describe('the aria fold survives running twice through React', () => {
  it('folds role and aria-label, and leaves no alias in the payload', () => {
    mount(ROOT_TAG, <view testID="folded" role="button" aria-label="close" />);

    const props = foldedPayload('folded');
    expect(props.accessibilityRole).toBe('button');
    expect(props.accessibilityLabel).toBe('close');
    // Neither alias may survive. `fabricProps` copies unknown keys through verbatim, so a
    // surviving `role` rides to Fabric as a key no ViewConfig knows — which is exactly the defect
    // three adapters were shipping before the fold moved down.
    expect(Object.hasOwn(props, 'role')).toBe(false);
    expect(Object.hasOwn(props, 'aria-label')).toBe(false);
    unmount(ROOT_TAG);
  });

  // The case a double pass could actually corrupt: pass 1 writes the composite from the alias, and
  // a pass 2 that re-read the (now blanked) alias would overwrite the field with `undefined`.
  it('does not let the second pass blank a composite the first pass built', () => {
    mount(
      ROOT_TAG,
      <view
        testID="composite"
        accessibilityState={{ checked: false, busy: true }}
        aria-checked
      />,
    );

    // Inside a composite the ALIAS wins per field — the opposite of the scalar rule above, and the
    // pair is what a "simplification" of the fold collapses.
    const props = foldedPayload('composite');
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
