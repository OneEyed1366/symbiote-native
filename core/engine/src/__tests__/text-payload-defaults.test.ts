// React Native's two Text defaults, applied where every adapter gets them for free.
//
// why: `Text.js:289` and `:291` apply them unconditionally on the way to native —
// `allowFontScaling = allowFontScaling !== false` and `ellipsizeMode = ellipsizeMode ?? 'tail'` —
// and without them a `numberOfLines={1}` line clips mid-word with no ellipsis, because native's own
// fallback is `clip`. Device-observed 2026-08-19; nothing failed, the text was simply wrong, which is
// why four adapters carried it.
//
// THREE ADAPTERS SEED THEM AS PROPS INSTEAD, and that is what this moves. Vue, Angular and Solid each
// write both keys onto every text node at `createElement` (`seedTextDefaults`). The app then authors
// the same two values and each write crosses into the host, converts to a `folly::dynamic`, and is
// dropped for equalling what is already there. Measured on `adapter-create-cost.itest.tsx` with the
// `writesOfUnchanged` counter: **6 000 wasted crossings per 1 000-row create**, against zero for the
// engine driven directly and zero for React.
//
// The payload builder is the right home for the same reason `foldTextInputValue` lives there: these
// are the PLATFORM's semantics, not any adapter's, so a rule stated once serves every adapter and
// costs nothing per node. It is deliberately NOT a `payloadFold` — one of those costs ~17 us per node
// per commit (`CLAUDE.md`, "A `payloadFold` costs ~17 us per node PER COMMIT"), which is worse than
// what it saves.
//
// The rule is restated here rather than imported from `core/components/src/text-props.ts` because the
// engine sits BELOW that package and cannot depend on it. `foldTextInputValue` already lives in two
// places for the same reason — this file is what keeps the copies honest.

import { describe, expect, it } from 'vitest';
import { installRecordingFabric } from '@symbiote-native/test-utils';
import { createElement } from '@symbiote-native/engine';
import { fabricProps } from '../fabric-props';

installRecordingFabric();

const TEXT = 'RCTText';
const VIEW = 'RCTView';

function payloadOf(
  component: string,
  props: Record<string, unknown>,
): Record<string, unknown> {
  return fabricProps(createElement(component, component === TEXT), props);
}

describe('the text defaults reach the payload without any adapter writing them', () => {
  // why: the case the seed exists for — a `<text>` the app spelled with no props at all still has to
  // reach native with `tail`, or it clips.
  it('supplies both defaults to a text node that authored neither', () => {
    const payload = payloadOf(TEXT, {});

    expect(payload.ellipsizeMode).toBe('tail');
    expect(payload.allowFontScaling).toBe(true);
  });

  // why: a default is a fallback, never an override. This is the half a payload-time rule could get
  // wrong in a way the seed could not, since the seed ran BEFORE the author's write and simply lost.
  it('lets an authored value win', () => {
    const payload = payloadOf(TEXT, {
      ellipsizeMode: 'clip',
      allowFontScaling: false,
    });

    expect(payload.ellipsizeMode).toBe('clip');
    expect(payload.allowFontScaling).toBe(false);
  });

  // why: `!== false`, not `?? true`. React Native treats an explicit `undefined` and a missing prop
  // alike and only a literal `false` opts out — so an adapter that spells an absent prop as
  // `undefined` must still get the default rather than `undefined` reaching native.
  it('treats an explicit undefined as absent, which only a literal false opts out of', () => {
    const payload = payloadOf(TEXT, {
      ellipsizeMode: undefined,
      allowFontScaling: undefined,
    });

    expect(payload.ellipsizeMode).toBe('tail');
    expect(payload.allowFontScaling).toBe(true);
  });

  // why: the keys are Text's, and a `<View>` carrying them would be two junk props on every node in
  // the tree — the cost this change exists to remove, reintroduced at a hundred times the scale.
  it('leaves a non-text node alone', () => {
    const payload = payloadOf(VIEW, {});

    expect('ellipsizeMode' in payload).toBe(false);
    expect('allowFontScaling' in payload).toBe(false);
  });
});
