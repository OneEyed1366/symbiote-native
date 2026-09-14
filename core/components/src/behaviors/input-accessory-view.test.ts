// Proving the behavior BEFORE the `HOST_PRIMITIVES` key exists, which is the order the fold-only
// recipe insists on: a missing fold does not fail — it sends a key no ViewConfig declares to Fabric,
// which throws nothing, logs nothing and paints nothing.

import { describe, expect, it } from 'vitest';
import { HOST_PRIMITIVES } from '../../host-primitives.cjs';
import {
  INPUT_ACCESSORY_VIEW_PROP_NAMES,
  mapInputAccessoryViewProps,
} from '../view/render-input-accessory-view';
import {
  foldInputAccessoryViewPayload,
  INPUT_ACCESSORY_VIEW_TAG,
} from './input-accessory-view';

const FLAT_BAG = {
  nativeID: 'bar-1',
  backgroundColor: '#eee',
  style: { paddingTop: 4 },
  testID: 'acc',
  accessibilityLabel: 'toolbar',
};

describe('the tag fold is the shared mapping', () => {
  // Compared as a whole object, not per key: a per-key assertion cannot see a key the behavior
  // ADDS, and an added key no ViewConfig declares is the same silent failure as a missing one.
  it('commits exactly what mapInputAccessoryViewProps produces', () => {
    const folded = foldInputAccessoryViewPayload(FLAT_BAG);
    const mapped = mapInputAccessoryViewProps({
      nativeID: FLAT_BAG.nativeID,
      backgroundColor: FLAT_BAG.backgroundColor,
      style: FLAT_BAG.style,
      passthrough: {
        testID: FLAT_BAG.testID,
        accessibilityLabel: FLAT_BAG.accessibilityLabel,
      },
    });

    expect(folded).toEqual(mapped);
  });

  // There is no aliasing in this primitive, so "every consumed alias is absent from the output" has
  // no rows — and that ABSENCE is the finding rather than an omission. Asserting the consumed list
  // is exactly the identity set states it, so a future alias cannot be added without this failing.
  it('consumes only names it re-emits under the same name', () => {
    const output = Object.keys(foldInputAccessoryViewPayload(FLAT_BAG));

    for (const name of INPUT_ACCESSORY_VIEW_PROP_NAMES) {
      expect(output, `${name} is consumed, so it must come back`).toContain(
        name,
      );
    }
  });

  // A behavior fold is keyed on the tag and can meet already-folded props (a re-render that writes
  // the same bag back). Pinned rather than reasoned — a double fold is invisible precisely when it
  // is harmless.
  it('is idempotent', () => {
    const once = foldInputAccessoryViewPayload(FLAT_BAG);
    const twice = foldInputAccessoryViewPayload(once);

    expect(twice).toEqual(once);
  });

  it('narrows a malformed bag instead of forwarding it', () => {
    const folded = foldInputAccessoryViewPayload({
      nativeID: 42,
      backgroundColor: { r: 1 },
      style: 'not-a-style',
      testID: 'acc',
    });

    expect(folded.nativeID).toBeUndefined();
    expect(folded.backgroundColor).toBeUndefined();
    expect(folded.style).toBeUndefined();
    expect(folded.testID, 'an unconsumed key still passes through').toBe('acc');
  });

  // The staged control expired as designed when the key landed, and is replaced by its other half:
  // the entry and the registration must agree about the tag. A behavior registered on a name the
  // spec does not emit folds nothing, silently — the same shape as the fold never landing.
  it('the spec entry emits the tag the behavior is registered on', () => {
    expect(HOST_PRIMITIVES.InputAccessoryView?.intrinsic).toBe(
      INPUT_ACCESSORY_VIEW_TAG,
    );
  });
});
