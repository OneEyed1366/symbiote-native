// Coverage scope: long-press SYNTHESIS itself — the hold timer, the 500ms delay, the
// deactivation-distance drift cancellation, and press suppression on a completed long press —
// is engine-level logic with NO React involvement (core/engine/src/events/events.test.ts,
// `describe('longPress synthesis')`), exercised there directly against `routeProp` on a raw
// fake-Fabric tree. That suite already covers: no timer armed without a listener, fires +
// suppresses the trailing press, does not fire before the delay, drift past the deactivation
// distance cancels the timer, and small jitter within it does not. This file does NOT re-walk
// those branches through a React mount — it proves only the thing the engine test cannot: that
// React's `Text` component actually forwards `onLongPress`/`onPress` into the engine's routeProp
// path at all, for BOTH outcomes (a hold and a quick tap), so a dropped/misnamed prop in the
// React adapter would be caught here.
//
// No Negative group: long-press is a gesture-recognition concern with no invalid input to
// reject — every touch sequence resolves to one of "long press", "press", or "neither".

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount, Text } from '@symbiote-native/react';
import { installFabric } from '@symbiote-native/test-utils';

const ROOT_TAG = 140;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
// Longer than the 500ms synthesis delay so the hold timer has surely fired.
const HOLD_ADVANCE_MS = 600;

const fabric = installFabric();
beforeEach(() => {
  vi.useFakeTimers();
  fabric.reset();
});
afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

function handleFor(testID: string): unknown {
  const node = fabric.find(n => n.props.testID === testID);
  if (!node) throw new Error(`no node created with testID=${testID}`);
  return node.instanceHandle;
}

describe('React long-press wiring (Positive)', () => {
  it('routes a sustained hold to onLongPress and suppresses onPress', () => {
    // why: proves BOTH `onLongPress` and `onPress` reach the engine's routeProp path from a
    // real React <Text> mount — the timer/delay/suppression mechanics themselves are
    // engine-tested (see file header); a React-side regression here would look like "onLongPress
    // silently never fires" with no engine-level test able to catch it.
    let longPress = 0;
    let press = 0;
    mount(
      ROOT_TAG,
      <Text
        testID="hold"
        onLongPress={() => {
          longPress++;
        }}
        onPress={() => {
          press++;
        }}
      >
        hold me
      </Text>,
    );
    const h = handleFor('hold');
    fabric.fireEvent(h, TOUCH_START);
    vi.advanceTimersByTime(HOLD_ADVANCE_MS);
    expect(longPress).toBe(1);
    fabric.fireEvent(h, TOUCH_END);
    expect(press).toBe(0);
  });

  it('routes a quick tap to onPress, never onLongPress', () => {
    // why: the mirror case — a React Text with BOTH handlers wired must still resolve a quick
    // tap to onPress alone; without this, test 1 alone would only prove onLongPress is wired,
    // leaving a dropped onPress binding undetected.
    let longPress = 0;
    let press = 0;
    mount(
      ROOT_TAG,
      <Text
        testID="tap"
        onLongPress={() => {
          longPress++;
        }}
        onPress={() => {
          press++;
        }}
      >
        tap me
      </Text>,
    );
    const h = handleFor('tap');
    fabric.fireEvent(h, TOUCH_START);
    fabric.fireEvent(h, TOUCH_END);
    expect(press).toBe(1);
    expect(longPress).toBe(0);
  });
});
