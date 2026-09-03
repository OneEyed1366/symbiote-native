// Co-located unit test for the shared KeyboardAvoidingView math. Written while closing three
// documented divergences from RN's Libraries/Components/Keyboard/KeyboardAvoidingView.js — all
// three had been carried identically by all four adapters, which is exactly why no adapter test
// could see them (they agree with each other and with this module).
//
// Expectations come from RN's source, not from our implementation:
//   :198-215  the platform-split subscription, with RN's own comment on why
//   :100-105  the 'height' branch that adds the PREVIOUS inset back in
//   :88-96    the iOS Prefer-Cross-Fade early return
//
// No Negative group: nothing in this module throws. Malformed native payloads are answered with
// `undefined` / a zero inset — a Positive outcome named "ignores …", not an invented throw.

import { describe, expect, it } from 'vitest';
import {
  computeInset,
  readPrefersCrossFadeTransitions,
  keyboardAvoidingEventNamesFor,
  readKeyboardFrame,
  readLayoutFrame,
  resolveKeyboardAvoidingLayout,
} from './render-keyboard-avoiding-view';

const NO_OFFSET = 0;

describe('keyboardAvoidingEventNamesFor (Positive — RN KeyboardAvoidingView.js:198-215)', () => {
  // why: RN listens to the WILL notifications on iOS so the view rides up WITH the keyboard
  // animation instead of snapping into place after it. Its own comment gives the second, sharper
  // reason: with an undocked, split or floating keyboard iOS emits WillChangeFrame BEFORE
  // WillHide, so a change-frame listener applies a frame captured mid-dismissal.
  it('subscribes to the will-notifications on ios', () => {
    expect(keyboardAvoidingEventNamesFor('ios')).toEqual({
      show: 'keyboardWillShow',
      hide: 'keyboardWillHide',
    });
  });

  // why: Android has no will-notifications; RN uses the did- pair there.
  it('subscribes to the did-notifications off ios', () => {
    expect(keyboardAvoidingEventNamesFor('android')).toEqual({
      show: 'keyboardDidShow',
      hide: 'keyboardDidHide',
    });
  });

  // why: RN subscribes to exactly TWO events per platform. changeFrame is deliberately absent —
  // it is the listener the comment above warns against, and we used to subscribe to it.
  it.each(['ios', 'android'] as const)(
    'never asks for a change-frame listener on %s',
    os => {
      expect(Object.keys(keyboardAvoidingEventNamesFor(os)).sort()).toEqual([
        'hide',
        'show',
      ]);
    },
  );
});

describe('computeInset (Positive — the overlap the view must clear)', () => {
  it('lifts the view by how far its bottom edge passes the keyboard top', () => {
    expect(
      computeInset(
        { y: 0, height: 800 },
        { screenY: 500, height: 300 },
        NO_OFFSET,
      ),
    ).toBe(300);
  });

  it('subtracts the caller vertical offset from the keyboard top edge', () => {
    expect(
      computeInset({ y: 0, height: 800 }, { screenY: 500, height: 300 }, 50),
    ).toBe(350);
  });

  it('clamps to zero when the view sits entirely above the keyboard', () => {
    expect(
      computeInset(
        { y: 0, height: 400 },
        { screenY: 500, height: 300 },
        NO_OFFSET,
      ),
    ).toBe(0);
  });

  it.each([
    ['no measured frame', undefined, { screenY: 500, height: 300 }],
    ['no keyboard frame', { y: 0, height: 800 }, undefined],
  ])('ignores %s and lifts nothing', (_label, frame, keyboard) => {
    expect(computeInset(frame, keyboard, NO_OFFSET)).toBe(0);
  });
});

describe("computeInset with behavior 'height' (Positive — RN's previous-inset term)", () => {
  // why: THE bug this branch exists for. In 'height' mode the wrapper is shrunk BY the inset, so
  // its next onLayout reports a frame shorter by exactly that much. Without adding the previous
  // inset back in, the following keyboard event computes a smaller overlap, the wrapper grows,
  // and the view walks back down under the keyboard. RN adds `state.bottom` for precisely this;
  // it is a fixpoint correction, not an accumulation.
  it('stays at the same inset after the frame shrank by the previous one', () => {
    const keyboard = { screenY: 500, height: 300 };
    const first = computeInset({ y: 0, height: 800 }, keyboard, NO_OFFSET, {
      behavior: 'height',
      previousInset: 0,
    });
    expect(first).toBe(300);

    // The wrapper is now `initialHeight - inset` tall, and onLayout reported that.
    const second = computeInset(
      { y: 0, height: 800 - first },
      keyboard,
      NO_OFFSET,
      {
        behavior: 'height',
        previousInset: first,
      },
    );
    expect(second).toBe(first);
  });

  // why: the correction is 'height'-only. The other behaviors do not resize the measured wrapper
  // ('padding' pads inside it, 'position' moves an inner view), so their frame never shrinks and
  // adding the term would double the lift.
  it.each(['padding', 'position'] as const)(
    'ignores the previous inset for %s',
    behavior => {
      expect(
        computeInset(
          { y: 0, height: 800 },
          { screenY: 500, height: 300 },
          NO_OFFSET,
          {
            behavior,
            previousInset: 300,
          },
        ),
      ).toBe(300);
    },
  );

  it('ignores the previous inset when no behavior was given', () => {
    expect(
      computeInset(
        { y: 0, height: 800 },
        { screenY: 500, height: 300 },
        NO_OFFSET,
        {
          previousInset: 300,
        },
      ),
    ).toBe(300);
  });
});

describe('computeInset with Prefer Cross-Fade Transitions (Positive — RN:88-96)', () => {
  // why: with that iOS accessibility setting on, the keyboard reports screenY as 0 instead of its
  // real top edge. Run through the ordinary math that makes the overlap the view's ENTIRE
  // y + height, so the content is pushed completely off screen. RN answers 0 instead.
  it('lifts nothing when ios reports a zero keyboard top under cross-fade', () => {
    expect(
      computeInset(
        { y: 0, height: 800 },
        { screenY: 0, height: 300 },
        NO_OFFSET,
        {
          os: 'ios',
          prefersCrossFadeTransitions: true,
        },
      ),
    ).toBe(0);
  });

  // why: the early return is guarded on all three conditions. A zero screenY without the setting
  // is a legitimate full-screen keyboard, and Android never reports this shape at all.
  it('still lifts when the setting is off', () => {
    expect(
      computeInset(
        { y: 0, height: 800 },
        { screenY: 0, height: 300 },
        NO_OFFSET,
        {
          os: 'ios',
          prefersCrossFadeTransitions: false,
        },
      ),
    ).toBe(800);
  });

  it('still lifts on android even with the flag set', () => {
    expect(
      computeInset(
        { y: 0, height: 800 },
        { screenY: 0, height: 300 },
        NO_OFFSET,
        {
          os: 'android',
          prefersCrossFadeTransitions: true,
        },
      ),
    ).toBe(800);
  });
});

describe('readKeyboardFrame / readLayoutFrame (Positive — narrowing raw native payloads)', () => {
  it('reads the keyboard top edge and height off a well-formed payload', () => {
    expect(
      readKeyboardFrame({ endCoordinates: { screenY: 500, height: 300 } }),
    ).toEqual({
      screenY: 500,
      height: 300,
    });
  });

  it.each([
    ['a non-record payload', 'nope'],
    ['a missing endCoordinates', {}],
    [
      'a non-numeric screenY',
      { endCoordinates: { screenY: '500', height: 300 } },
    ],
  ])('ignores %s', (_label, payload) => {
    expect(readKeyboardFrame(payload)).toBeUndefined();
  });

  it('reads the measured frame off a well-formed layout', () => {
    expect(readLayoutFrame({ y: 10, height: 800 })).toEqual({
      y: 10,
      height: 800,
    });
  });

  it('ignores a layout missing its height', () => {
    expect(readLayoutFrame({ y: 10 })).toBeUndefined();
  });
});

describe('resolveKeyboardAvoidingLayout (Positive — behavior to structure)', () => {
  it('nests an inner view pushed up by the inset for position', () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'position',
      effectiveInset: 40,
    });
    expect(layout.kind).toBe('nested');
  });

  it('pads the wrapper for padding', () => {
    const layout = resolveKeyboardAvoidingLayout({
      behavior: 'padding',
      effectiveInset: 40,
    });
    expect(layout).toEqual({
      kind: 'wrapper',
      wrapperStyle: [undefined, { paddingBottom: 40 }],
    });
  });

  // why: RN only shrinks the wrapper once it has a measured starting height; before that there is
  // nothing to subtract from and the view must render untouched.
  it('leaves the wrapper alone for height before the first measurement', () => {
    expect(
      resolveKeyboardAvoidingLayout({ behavior: 'height', effectiveInset: 40 }),
    ).toEqual({
      kind: 'wrapper',
      wrapperStyle: undefined,
    });
  });
});

describe('readPrefersCrossFadeTransitions (Positive — a failed read is not an answer of "yes")', () => {
  // why: AccessibilityInfo's iOS getters REJECT when the native error callback fires — that is
  // deliberate RN parity, so the engine must keep it. But this particular caller runs at mount and
  // nobody awaits it, so a rejection would surface as an unhandled promise. Five adapters would
  // each need the same `.catch`, which is five chances to forget one; it belongs here instead.
  it('answers false when the underlying query rejects', async () => {
    await expect(
      readPrefersCrossFadeTransitions(() =>
        Promise.reject(new Error('native getter failed')),
      ),
    ).resolves.toBe(false);
  });

  it.each([true, false])(
    'passes a successful read through unchanged (%s)',
    async enabled => {
      await expect(
        readPrefersCrossFadeTransitions(() => Promise.resolve(enabled)),
      ).resolves.toBe(enabled);
    },
  );
});
