// Why a `payloadFold` still returns the WHOLE bag, when returning only what it changed would be
// most of the cost of a fold.
//
// [characterization — this pins the contract as it IS, and records why the cheaper one was tried
//  and pulled back the same hour]
//
// THE COST. Measured on `build-release` (`core/engine/cpp/tests/js/adapter-create-cost.itest.tsx`),
// a fold is ~17 us per node per commit, and split three ways it reads
//
//   toJs = 1.6    call = 1.6    fromJs = 13.3
//
// The same bag travels both directions, because every fold in `core/components/src/behaviors/`
// returns `{ ...props, ...whatItChanged }`. Sending it is `jsi::valueFromDynamic`, building an
// object out of a `folly::dynamic` the host already holds. Reading it back is
// `jsi::dynamicFromValue` — `getPropertyNames`, then per key `getValueAtIndex` + `getString` + a
// `std::string` allocation + `getProperty`. That is upstream's function, so there is nothing to tune
// inside it; the only lever is how many keys make the trip. About eighteen come back to express a
// change to five.
//
// THE FIX THAT DOES NOT FIT, AND THE PREMISE THAT WAS WRONG. Have the fold return a PATCH and merge
// it over the bag. It was written on the reasoning that this is backwards-compatible — a whole-bag
// return is a superset of the patch, and merging a superset over its own base leaves the base
// unchanged — so the ~14 fold sites could convert one at a time.
//
// **That reasoning is false, and the button tests caught it in one run.** A fold expresses a REMOVAL
// by not putting the key back, so replacing is load-bearing: merge, and every key a fold strips
// returns from the base. Button's `ownerFold` strips `title` and `color`, `pressable` strips
// `MACHINE_ONLY_KEYS`, `text-input` strips `ALIAS_ONLY_KEYS` — and a grep for `delete` finds only the
// last two, because the first drops them by omission. There is no safe subset to convert first.
//
// AND THE OBVIOUS REMOVAL CHANNEL IS CLOSED TOO. A patch cannot mark a key for removal with a value:
// `jsi::dynamicFromValue` maps JS `null` AND JS `undefined` onto the same `folly::dynamic` nullptr,
// so nothing a key can hold tells "drop this" apart from "reset this to the platform default" — and
// the second is a real instruction Fabric reads, asserted below so it stays that way.
//
// SO THE CONTRACT HAS TO CARRY REMOVAL SEPARATELY, and that is the next shape to try: either a
// two-slot return (`{ set, omit }`, unambiguous through the conversion and cheap — one small object
// and one short array) or a static per-component omit list, which is what two of the three strippers
// actually have. Button's is not static, so the list alone does not cover the set. Whichever it is,
// it lands in ONE commit across every site: a mixed contract silently drops props.

import { describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createElement, type ISymbioteNode } from '@symbiote-native/engine';
import { fabricProps } from '../fabric-props';

installRecordingFabric();

const VIEW = 'RCTView';

function foldedPayload(
  node: ISymbioteNode,
  props: Record<string, unknown>,
): Record<string, unknown> {
  return fabricProps(node, props);
}

describe('a payloadFold replaces the bag it is given', () => {
  // why: the property that makes a removal expressible, and the one a merge would take away. It is
  // asserted rather than assumed because the next attempt at the cheaper contract will start by
  // wondering whether replacing was ever load-bearing.
  it('drops a key the fold does not put back', () => {
    const node = createElement(VIEW);
    node.payloadFold = props => {
      const next = { ...props };
      delete next.nativeID;
      return next;
    };

    const payload = foldedPayload(node, { testID: 'kept', nativeID: 'gone' });

    expect(payload.testID).toBe('kept');
    expect('nativeID' in payload).toBe(false);
  });

  // why: an explicit null is a VALUE — Fabric reads it as "reset to the platform default" — so it
  // must survive the fold rather than read as an absence. This is also what closes the door on
  // removal-by-null in any future patch contract: if a null deleted, no fold could send a reset.
  it('keeps a key the fold sets to null', () => {
    const node = createElement(VIEW);
    node.payloadFold = props => ({ ...props, nativeID: null });

    expect(foldedPayload(node, { nativeID: 'was' }).nativeID).toBe(null);
  });

  // why: the headless builder and the C++ one are two implementations of one contract, and a fold is
  // the seam where they are easiest to drift apart on — this side is a spread, that side is a
  // `folly::dynamic` assignment. Pinning the plain case here is what makes the C++ twin's comment
  // checkable against something.
  it('takes the fold output as the payload, keys and all', () => {
    const node = createElement(VIEW);
    node.payloadFold = () => ({ testID: 'only' });

    expect(
      foldedPayload(node, { testID: 'authored', nativeID: 'dropped' }),
    ).toEqual({
      testID: 'only',
    });
  });
});
