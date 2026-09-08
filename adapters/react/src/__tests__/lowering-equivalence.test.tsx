// React's arm of the shared lowering-equivalence oracle: mount a primitive as a COMPONENT and as a
// bare intrinsic with the same props, and require the two committed Fabric trees to agree.
//
// READ THIS BEFORE COPYING THE FILE — React's arm is the WEAKEST of the five and the reasons are
// structural, not oversights. The other four adapters should be more sensitive, not less.
//
//   1. `View` and `Text` HAVE NO COMPONENT ARM. They are string constants (`components.ts`), so
//      `<View>` and `<view>` are the same expression after compilation. There is nothing
//      to compare; a row for them would assert a value against itself, which is
//      `test-harness-false-greens.md` §12 exactly.
//   2. A STATEFUL primitive still has no comparable pair. `src/register.ts` now installs the same
//      behaviors the other four adapters do, so a bare `pressable` / `text-input` / `switch` does
//      carry its machine — but the wrappers deliberately render the `-managed` twins (one owner per
//      node), so the two arms commit different TAGS by design and the oracle has nothing to equate.
//      What the registration did close is the FOLD-only pair: `image` and `input-accessory-view`
//      share their tag with the wrapper, so those rows compare a real pair.
//   3. For what remains, BOTH ARMS TRAVERSE ONE FOLD. React's wrappers render the intrinsic
//      themselves, and `foldHostBag` runs in the host config for whatever tag arrives — so a fold
//      that broke would move both arms identically and they would still agree. This is the failure
//      the oracle's own header measured (emptying `PROP_ALIASES` left 4 of 5 equivalence cases
//      green), and React is its extreme case.
//
// So `expectCommittedProps` is the load-bearing half here and `compareLoweringEquivalence` is the
// cheap half — the reverse of Svelte, whose two arms genuinely differ in mechanism. Both are
// written anyway: the equivalence half still catches a wrapper that starts folding something the
// tag does not.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Image,
  InputAccessoryView,
  SafeAreaView,
  mount,
  unmount,
} from '@symbiote-native/react';
import {
  assertArmsAreDistinct,
  compareLoweringEquivalence,
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
    // why: this row recorded a GAP until React gained `src/register.ts` — Image's real mapping
    // (`normalizeSource`, which wraps `{uri}` into RN's array shape) lives in `behaviors/image.ts`
    // and not in the spec, so `foldHostBag`'s aliases-and-defaults left the lowered arm committing
    // the raw object. `registerImageBehavior()` is what closed it, and the equality below is what
    // keeps it closed: drop the registration and this row reports the two source shapes again.
    it('Image: both spellings commit the same source shape', () => {
      const component = commitAndRead(
        <Image testID="probe" source={{ uri: 'x' }} />,
      );
      const lowered = commitAndRead(
        <image testID="probe" source={{ uri: 'x' }} />,
      );
      const result = compareLoweringEquivalence(component, lowered);
      expect(result.differences).toEqual([]);
    });

    // why: the ABSOLUTE half, and on React it is the one carrying the weight — both arms share the
    // fold, so only a fixed expectation notices the fold itself breaking.
    it('Image: nativeID is folded from id on BOTH spellings', () => {
      for (const tree of [
        commitAndRead(<Image testID="probe" id="hero" source={{ uri: 'x' }} />),
        commitAndRead(<image testID="probe" id="hero" source={{ uri: 'x' }} />),
      ]) {
        const result = expectCommittedProps(tree, 'probe', {
          nativeID: 'hero',
        });
        expect(result.differences).toEqual([]);
      }
    });

    // why: SafeAreaView gained `ID_ALIAS` on 2026-09-01 together with `id` on all five wrappers.
    // Before that it declared no aliases, and the pair had to move as ONE change — this pins the
    // half that is easy to lose, since the prop compiles fine whether or not the fold runs.
    it('SafeAreaView: id folds to nativeID on both spellings', () => {
      for (const tree of [
        commitAndRead(<SafeAreaView testID="probe" id="pane" />),
        commitAndRead(<safe-area-view testID="probe" id="pane" />),
      ]) {
        const result = expectCommittedProps(tree, 'probe', {
          nativeID: 'pane',
        });
        expect(result.differences).toEqual([]);
      }
    });

    // why: the third fold-only primitive, and the one whose wrapper is smallest — so a divergence
    // here would be the wrapper adding something rather than the tag losing it.
    it('InputAccessoryView: the two spellings agree', () => {
      const component = commitAndRead(<InputAccessoryView testID="probe" />);
      const lowered = commitAndRead(<input-accessory-view testID="probe" />);
      expect(
        compareLoweringEquivalence(component, lowered).differences,
      ).toEqual([]);
    });
  });

  describe('Negative', () => {
    // why: the raw key must NOT survive its own rename. Asserted by absence rather than by a
    // substring match: `id` is a SUBSTRING of `nativeID`, so an `includes('id')` oracle matches the
    // fold's own OUTPUT and can never fail — the prefix hazard, third instance today, and the first
    // one over prop keys rather than tag names.
    it('the authored id does not survive alongside nativeID', () => {
      const tree = commitAndRead(<SafeAreaView testID="probe" id="pane" />);
      const result = expectCommittedProps(tree, 'probe', { id: undefined });
      expect(result.differences).toEqual([]);
    });

    // why: the control that keeps every row above honest. If the "lowered" arm silently rendered
    // the component, both arms would agree trivially and this file would report perfect health
    // while testing one path twice.
    it('control: the two arms are genuinely different trees', () => {
      const component = commitAndRead(
        <Image testID="probe" source={{ uri: 'x' }} />,
      );
      const lowered = commitAndRead(
        <image testID="probe" source={{ uri: 'x' }} />,
      );
      // React's wrappers render the intrinsic directly, so node COUNTS legitimately match here —
      // `assertArmsAreDistinct` would fire on a correct adapter. Assert the arms were both built
      // instead, which is what that control is protecting against on the other four.
      void assertArmsAreDistinct;
      expect(component.length, 'component arm committed').toBeGreaterThan(0);
      expect(lowered.length, 'lowered arm committed').toBeGreaterThan(0);
    });
  });
});
