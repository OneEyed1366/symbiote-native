// Proves `Text`'s RN defaults reach the committed Fabric node.
//
// Why this file exists at all, and why it was written the day `Text` stopped being a component.
// The defaults used to be applied by the wrapper's body (`resolveTextProps`); they are now applied
// by the renderer, from `HOST_PRIMITIVES.Text.defaults`, because a bare intrinsic tag has no
// wrapper. NOTHING in this adapter asserted them either way — the whole suite stayed green with
// them present, and would have stayed green with them gone, which is the silent shape
// `.claude/rules/test-harness-false-greens.md` is about. Angular has the same file for the same
// reason (`src/__tests__/text-defaults.test.ts`).
//
// The value of a default here is not cosmetic: without `ellipsizeMode` a long title clips
// mid-word on device instead of ellipsising, and Svelte shipped exactly that defect from exactly
// this cause (2026-08-31).
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Text, View, mount, unmount } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 241;

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function textNode(): Record<string, unknown> {
  const node = fabric.find(n => n.viewName === 'RCTText');
  expect(node, 'an RCTText was created').toBeDefined();
  return node!.props;
}

describe('Text defaults reach Fabric', () => {
  describe('Positive', () => {
    // why: RN's own default. A Text with no ellipsizeMode must still truncate with an ellipsis,
    // and the prop has to be PRESENT in the payload — Fabric reads the prop, not a JS default.
    it('seeds ellipsizeMode=tail when unauthored', () => {
      mount(ROOT_TAG, <Text>hi</Text>);
      expect(textNode().ellipsizeMode).toBe('tail');
    });

    // why: `allowFontScaling` is RN's `!== false` encoding, not `?? true` — an unset prop means
    // "scaling on", and only a literal false opts out. A `??` would read undefined as unset and
    // give the same answer here, so the discriminating case is the Negative one below.
    it('seeds allowFontScaling=true when unauthored', () => {
      mount(ROOT_TAG, <Text>hi</Text>);
      expect(textNode().allowFontScaling).toBe(true);
    });

    // why: a default is a default, not an override — an authored value has to survive it.
    it('keeps an authored ellipsizeMode', () => {
      mount(ROOT_TAG, <Text ellipsizeMode="middle">hi</Text>);
      expect(textNode().ellipsizeMode).toBe('middle');
    });

    // why: the fold is per-primitive, so it must NOT leak onto a View — a stray ellipsizeMode on
    // an RCTView is a key no ViewConfig declares, dropped silently by Fabric.
    //
    // Matched by testID, not by viewName: the surface's own container is an RCTView too, and it
    // carries no text defaults either — so a viewName match would pass against the container and
    // never look at the View under test (`.claude/rules/test-harness-false-greens.md` §3).
    it('does not seed text defaults onto a View', () => {
      mount(ROOT_TAG, <View testID="probe" />);
      const view = fabric.find(n => n.props.testID === 'probe');
      expect(view, 'the probed View was created').toBeDefined();
      expect('ellipsizeMode' in view!.props).toBe(false);
      expect('allowFontScaling' in view!.props).toBe(false);
    });
  });

  describe('Negative', () => {
    // why: this is the case that separates `notFalse` from a plain `??`. An explicit false must
    // survive as false; a `?? true` implementation passes every Positive case above and fails
    // this one, which is the only reason the encoding is worth asserting.
    it('keeps an explicit allowFontScaling={false}', () => {
      mount(ROOT_TAG, <Text allowFontScaling={false}>hi</Text>);
      expect(textNode().allowFontScaling).toBe(false);
    });
  });
});
