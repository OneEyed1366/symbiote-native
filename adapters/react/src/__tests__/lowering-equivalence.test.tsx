// React's arm of the shared lowering-equivalence oracle — and it has lost the EQUIVALENCE half, on
// purpose. Every primitive here is a bare tag now (`src/index.ts` records where each wrapper's body
// went), so there is no second spelling to compare against: an arm-vs-arm row would assert a value
// against itself, which is `test-harness-false-greens.md` §12 exactly.
//
// So what remains is the ABSOLUTE half, `expectCommittedProps`, and on this adapter it was always
// the load-bearing one. The oracle's own header measured why: when a fold lives in a layer BOTH
// arms traverse — React's wrappers rendered the intrinsic themselves, and `foldHostBag` runs in the
// host config for whatever tag arrives — deleting it moves both arms identically and they still
// agree. Emptying `PROP_ALIASES` left 4 of 5 equivalence cases green.
//
// READ THIS BEFORE COPYING THE FILE. The other four adapters should keep both halves: theirs
// genuinely differ in mechanism, and cross-arm is what catches a fold ONE path loses. Here every
// row instead names the exact key a broken fold would drop — which is stronger, not weaker, since
// it fails even when nothing to compare against survives.
//
// NO component arm is left: all ten primitives are tags.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import {
  assertArmsAreDistinct,
  expectCommittedProps,
  installFabric,
} from '@symbiote-native/test-utils';
import { HOST_PRIMITIVES } from '../../../../core/components/host-primitives.cjs';

const ROOT_TAG = 981;
const fabric = installFabric();

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function commitAndRead(element: React.ReactElement) {
  mount(ROOT_TAG, element);
  const tree = fabric.appRoot().children;
  unmount(ROOT_TAG);
  fabric.reset();
  return tree;
}

describe('React: component and bare intrinsic commit the same tree', () => {
  // why: THE anti-degeneracy control, and it is not the same as `assertArmsAreDistinct`. That one
  // catches an ARM that never lowered; this one catches the SPEC going quiet. Every assertion below
  // is conditioned on `HOST_PRIMITIVES` carrying folds worth checking, so a spec that emptied itself
  // would leave the whole file green by agreement — measured on the Svelte session's alias suite,
  // where emptying every alias map turned a derived block green.
  it('control: the spec still declares folds worth comparing', () => {
    const names = Object.keys(HOST_PRIMITIVES);
    expect(names.length, 'HOST_PRIMITIVES is not empty').toBeGreaterThan(0);
    const withFolds = Object.values(HOST_PRIMITIVES).filter(
      p =>
        Object.keys(p.aliases).length > 0 || Object.keys(p.defaults).length > 0,
    );
    expect(
      withFolds.length,
      'at least one primitive declares an alias or a default — otherwise every row below is vacuous',
    ).toBeGreaterThan(0);
  });

  describe('Positive', () => {
    // why: Image's real mapping (`normalizeSource`, which wraps `{uri}` into RN's array shape)
    // lives in `behaviors/image.ts` and not in the spec, so `foldHostBag`'s aliases-and-defaults
    // alone would leave the tag committing the raw object. `registerImageBehavior()` is what
    // closes it; drop the registration and this row reports the raw shape.
    it('Image: the tag commits RNs array source shape', () => {
      const tree = commitAndRead(
        <image testID="probe" source={{ uri: 'x' }} />,
      );
      expect(
        expectCommittedProps(tree, 'probe', {
          source: [{ uri: 'x' }],
        }).differences,
      ).toEqual([]);
    });

    it('Image: nativeID is folded from id', () => {
      const tree = commitAndRead(
        <image testID="probe" id="hero" source={{ uri: 'x' }} />,
      );
      expect(
        expectCommittedProps(tree, 'probe', { nativeID: 'hero' }).differences,
      ).toEqual([]);
    });

    // why: SafeAreaView gained `ID_ALIAS` on 2026-09-01, and the fold is invisible either way —
    // the prop compiles whether or not it runs. There is no component arm left to compare against
    // (the wrapper is deleted), so this ABSOLUTE assertion is the whole coverage of the fold.
    it('SafeAreaView: id folds to nativeID on the tag', () => {
      const tree = commitAndRead(<safe-area-view testID="probe" id="pane" />);
      const result = expectCommittedProps(tree, 'probe', { nativeID: 'pane' });
      expect(result.differences).toEqual([]);
    });

    // why: the third fold-only primitive. No component arm survives, so this is the ABSOLUTE half
    // only — the fold assembles the host node, and `nativeID` is what a TextInput docks against.
    it('InputAccessoryView: the tag carries its fold', () => {
      const tree = commitAndRead(
        <input-accessory-view testID="probe" nativeID="acc" />,
      );
      expect(
        expectCommittedProps(tree, 'probe', { nativeID: 'acc' }).differences,
      ).toEqual([]);
    });

    // why: the fourth fold-only primitive, and the last one whose wrapper was a pure passthrough.
    // Absolute only, for the same reason as the two above — there is no component arm left.
    it('RefreshControl: id folds to nativeID on the tag', () => {
      const tree = commitAndRead(
        <refresh-control testID="probe" id="rc" refreshing={false} />,
      );
      expect(
        expectCommittedProps(tree, 'probe', { nativeID: 'rc' }).differences,
      ).toEqual([]);
    });

    // why: the colour fold is the one every adapter used to run in its own platform file — a
    // lowered switch that skipped it would send RN's PUBLIC prop names to a view that declares
    // none of them, so nothing paints and nothing is red.
    it('Switch: the tag folds trackColor to the native iOS names', () => {
      const tree = commitAndRead(
        <switch
          testID="probe"
          value={true}
          trackColor={{ false: '#111', true: '#222' }}
        />,
      );
      expect(
        expectCommittedProps(tree, 'probe', {
          onTintColor: '#222',
          tintColor: '#111',
          trackColor: undefined,
        }).differences,
      ).toEqual([]);
    });

    // why: `value` is not a Fabric prop — native reads a private `text` alongside the event-count
    // handshake — and `readOnly` is a W3C alias for `editable`. A tag that skipped either fold
    // renders no text and accepts typing into a read-only field, on device only.
    it('TextInput: the tag folds value to text and readOnly to editable', () => {
      const tree = commitAndRead(
        <text-input testID="probe" value="hi" readOnly />,
      );
      expect(
        expectCommittedProps(tree, 'probe', {
          text: 'hi',
          editable: false,
          value: undefined,
        }).differences,
      ).toEqual([]);
    });

    // why: `disabled` is not a Fabric prop on a view — it has to reach a screen reader as
    // `accessibilityState.disabled`, and the press suppression works either way, so a lost fold
    // announces a dead button as ENABLED with nothing red anywhere.
    it('Pressable: disabled folds into accessibilityState', () => {
      const tree = commitAndRead(<pressable testID="probe" disabled />);
      expect(
        expectCommittedProps(tree, 'probe', {
          accessibilityState: { disabled: true },
          accessible: true,
        }).differences,
      ).toEqual([]);
    });

    // why: the press family's own `accessible` default (Pressable.js:252,
    // TouchableOpacity.js:303) — RN makes every pressable accessible unless the app opts OUT, and
    // each of these tags carries its OWN machine rather than sharing `pressable`, so each needs
    // its own row or one of them can lose the fold alone.
    it.each([
      ['touchable-opacity', <touchable-opacity key="o" testID="probe" />],
      ['touchable-highlight', <touchable-highlight key="h" testID="probe" />],
    ])('%s: carries the press family accessible default', (_name, element) => {
      const tree = commitAndRead(element);
      expect(
        expectCommittedProps(tree, 'probe', { accessible: true }).differences,
      ).toEqual([]);
    });

    // why: the axis base a wrapper used to compose under the app's own style. Two claims were made
    // about this row while ScrollView was the last wrapper standing — that the behavior owed
    // `horizontal` and `nestedScrollEnabled ?? true` before a bare tag could match it — and BOTH
    // were false, quoted out of a stale comment instead of read out of the behavior. The folds
    // were already there; `../components/scroll-view/scroll-view.test.tsx` pins each by name.
    it('scroll-view: the behavior composes the vertical axis base', () => {
      const tree = commitAndRead(<scroll-view testID="probe" />);
      expect(
        expectCommittedProps(tree, 'probe', {
          flexGrow: 1,
          flexShrink: 1,
          overflow: 'scroll',
          nestedScrollEnabled: true,
        }).differences,
      ).toEqual([]);
    });
  });

  describe('Negative', () => {
    // why: the raw key must NOT survive its own rename. Asserted by absence rather than by a
    // substring match: `id` is a SUBSTRING of `nativeID`, so an `includes('id')` oracle matches the
    // fold's own OUTPUT and can never fail — the prefix hazard, third instance today, and the first
    // one over prop keys rather than tag names.
    it('the authored id does not survive alongside nativeID', () => {
      const tree = commitAndRead(<safe-area-view testID="probe" id="pane" />);
      const result = expectCommittedProps(tree, 'probe', { id: undefined });
      expect(result.differences).toEqual([]);
    });

    // why: the control that keeps every row above honest. Every absolute row asserts what a
    // committed node CARRIES, and `expectCommittedProps` finds its node by `testID` — so a mount
    // that committed nothing at all would leave those rows unable to fail. This is the sentinel.
    it('control: the harness commits a tree at all', () => {
      // React commits the intrinsic directly on both spellings, so node COUNTS legitimately match
      // here and `assertArmsAreDistinct` would fire on a correct adapter — it guards the four
      // adapters whose component form allocates a wrapper node.
      void assertArmsAreDistinct;
      const tree = commitAndRead(
        <image testID="probe" source={{ uri: 'x' }} />,
      );
      expect(tree.length, 'the mount committed').toBeGreaterThan(0);
    });
  });
});
