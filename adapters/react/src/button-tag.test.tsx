// `button` as a TAG, measured through React's own reconciler. RN's Button takes no children
// (`title` is a string prop, Button.js:363) and builds a touchable > view > text subtree itself, so
// the wrapper this replaces was composition the engine behavior now owns
// (`core/components/src/behaviors/button.ts`).
//
// THE NODE COUNT IS THE REGISTRATION ORACLE HERE, unlike `touchable-native-feedback-tag.test.tsx`'s,
// whose tag commits nothing whether or not a behavior is attached. An unregistered `button` commits
// ONE bare view with no children, so the subtree assertion fails on the registration alone — and
// the payload assertions fail with it, which is the two-consequences-of-one-cause shape
// (`.claude/rules/test-harness-false-greens.md` §14).
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

// SIDE-EFFECT IMPORT: the behavior is what builds the subtree. An app reaches it through the
// package barrel; a test importing the renderer directly does not.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 9_972;
const fabric = installRecordingFabric();
// The behavior builds the subtree and folds `id` into `nativeID`, so every read here is `.payload`.
const live = createLiveTree(fabric);

// RN Button.js's iOS label look, owned by `buttonTextStyle` in @symbiote-native/components. MARGIN,
// not padding (Button.js:409) — the label pushes the button's edges outward instead of insetting.

// Every node under `root`, in tree order — the shape the view-name assertions below compare.
function flatten(root: ILiveNode): ILiveNode[] {
  return root.children.flatMap(node => [node, ...flatten(node)]);
}

/** The committed host, found by the `nativeID` its `id` folded into. */
function hostOf(label: string): ILiveNode {
  const host = live.findLive(
    live.appRoot(),
    node => node.payload.nativeID === label,
  );
  if (host === undefined) throw new Error(`no committed host ${label}`);
  return host;
}

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

describe('React: `button` as a tag', () => {
  it('commits RN’s four-node iOS subtree and paints the title', () => {
    mount(ROOT_TAG, createElement('button', { id: 'btn', title: 'Save' }));

    // RN's FOUR nodes on iOS, in order and by view name — the host (TouchableOpacity's own
    // Animated.View, which the tag IS), the inner view carrying the Material look on Android and
    // nothing here, the Text, and the raw text. Three of them exist only because the behavior built
    // them, so this is what fails when `./register` is dropped.
    //
    // Android commits THREE — TouchableNativeFeedback renders no view of its own, so the inner view
    // IS the host (Button.js:281-284). Asserted in
    // `core/components/src/behaviors/button-android.test.ts`, the only place with a Platform mock;
    // the branch is the behavior's, not this adapter's.
    const host = hostOf('btn');
    expect(host.viewName).toBe('RCTView');
    // The role is `foldButtonProps`'s in the engine now, which this host's TypeScript `fabricProps`
    // does not carry — `core/engine/cpp/tests/js/button-payload.itest.ts`. This case is about the
    // SUBTREE SHAPE either way.
    expect(flatten(host).map(node => node.viewName)).toEqual([
      'RCTView',
      'RCTText',
      'RCTRawText',
    ]);

    const text = host.children[0].children[0];
    // The label's STYLE left on 2026-09-18 — `foldButtonLabelStyle` in `SymbioteFabricProps.cpp`,
    // reached off the label text's own tag and reading the button through `IAncestorLookup`. This
    // harness builds its payload through the TypeScript `fabricProps`, which carries no copy of the
    // tag rules, so the base blue and the margin are `core/engine/cpp/tests/js/
    // button-derived-payload.itest.ts`'s now. The SUBTREE SHAPE, which is what this adapter
    // contributes, is what stays.
    //
    // RN's two Text DEFAULTS left the same way on 2026-09-18, for the same reason one layer along:
    // they were applied by `resolveTextProps` here and by four other copies, and now by the engine's
    // `foldTextDefaults` alone. `button-derived-payload.itest.ts` reads them off the label's real
    // payload; the node is located by POSITION, which the subtree shape already guarantees.
    expect(text.children[0].payload.text).toBe('Save');
  });

  // THE GREYING CASE LEFT ON 2026-09-18. `disabled` greys the label and wins over an explicit
  // `color` (RN pushes the disabled colour after the tint), and that whole expression is
  // `foldButtonLabelStyle` in `SymbioteFabricProps.cpp` now — including the three-way `disabled`
  // resolution it shares with the button's `focusable`. It is asserted against the committed payload
  // in `core/engine/cpp/tests/js/button-derived-payload.itest.ts`, with the aria-disabled arm beside
  // it.
  //
  // Nothing about THIS adapter went with it: its part is driving the tag so the subtree exists at
  // all, which the case above holds.
});
