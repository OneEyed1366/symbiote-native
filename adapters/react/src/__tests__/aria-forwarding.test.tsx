// What a React tag hands the engine for `role` / `aria-*` — the FORWARDING, as of 2026-09-18.
//
// **THIS FILE'S OLD SUBJECT WAS NEVER WHAT IT TESTED, and that is worth recording rather than
// quietly deleting.** Its title claimed the DOUBLE PASS: React's surviving wrappers call
// `resolveAccessibilityProps` on the way in, and the engine folds the same bag again on the way to
// Fabric, so pass 2 must be a no-op. True on device — but both cases below mount a BARE `<view>`,
// which has no wrapper, so pass 1 never ran and only one fold was ever exercised. The file was
// green for two passes while testing one.
//
// The real double-pass claim is now asserted where both passes exist:
// `core/engine/cpp/tests/js/aria-payload.itest.ts`, "leaves an already-folded bag alone".
//
// What stays here is the half a bare tag genuinely proves: the authored key reaches the engine under
// the authored NAME. The rule reads `aria-label` literally, so a renderer that camelised or dropped
// it would end accessibility in silence.
//
// WHY IT STILL NEEDS ITS OWN FILE, unchanged and still true: React's existing accessibility
// assertions (`components/pressable/pressable.test.tsx`) set `accessibilityRole` DIRECTLY — through
// Button's own mapping — so none of them travels the alias path at all.
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

describe('what a React tag hands the engine for aria', () => {
  // why: the engine's rule reads the HYPHENATED name literally, so the authored spelling is the
  // contract and this adapter's job is to not touch it. React passes JSX props through with no
  // normalisation, which is what makes this cheap to assert and worth asserting anyway: a future
  // `applyProps` that camel-cased unknown keys would break accessibility in silence.
  it('forwards role and a hyphenated aria key under their authored names', () => {
    mount(ROOT_TAG, <view testID="folded" role="button" aria-label="close" />);

    const props = foldedPayload('folded');
    expect(props.role).toBe('button');
    expect(props['aria-label']).toBe('close');
    unmount(ROOT_TAG);
  });

  // why: a boolean JSX shorthand (`aria-checked`, no value) is `true`, and it has to reach the
  // engine AS a boolean beside the composite it will be folded into — the rule cannot apply a
  // per-field precedence to a bag missing either side.
  it('forwards a shorthand alias alongside the composite it applies to', () => {
    mount(
      ROOT_TAG,
      <view
        testID="composite"
        accessibilityState={{ checked: false, busy: true }}
        aria-checked
      />,
    );

    const props = foldedPayload('composite');
    expect(props.accessibilityState).toEqual({ checked: false, busy: true });
    expect(props['aria-checked']).toBe(true);
    unmount(ROOT_TAG);
  });
});
