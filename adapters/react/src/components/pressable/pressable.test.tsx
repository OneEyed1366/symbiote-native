// Co-located React-driven pipeline test.
// Drives the real touch primitives the way native would
// (topTouchStart/Move/End on the responder node's instanceHandle) and asserts the
// synthesized press, disabled suppression, the JS-synthesized onLongPress timer,
// pressRetentionOffset (radius and measured per-edge rect), unstable_pressDelay,
// onResponderTerminationRequest gating, onPressMove, plus Button's a11y mapping.
//
// Pressable measures its responder rect on grant (RN's _measureResponderRegion); the
// shared recorder has no `measure`, so graft a configurable one onto the live slot before
// any mount. Long-press / pressDelay timers run on vitest fake timers.
//
// SCOPE: core/components/src/state/pressable.test.ts owns the timer/transition machine directly.
// This file proves the React lifecycle bridge: responder listeners reach the real host, state
// updates survive a re-render, the 130ms floor uses React's scheduler/clock, and unmount disposes
// pending work.
//
// No Negative group: nothing here has a throwing path. "disabled" suppresses a press silently
// (a Positive contract — completes without error, callback just never fires), it never rejects.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, unmount } from '@symbiote-native/react';
import { DEFAULT_MIN_PRESS_DURATION_MS } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  isSymbioteNode,
  listenerFor,
  type IListener,
} from '@symbiote-native/engine';

const ROOT_TAG = 110;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';
const TOUCH_IDENTIFIER = 1;
const TERMINATION_REQUEST = 'responderTerminationRequest';

// The frame slot.measure reports; undefined leaves the responder unmeasured, so nothing drifts
let measuredFrame:
  { width: number; height: number; pageX: number; pageY: number } | undefined;

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.measure = (_node, callback) => {
  const frame = measuredFrame;
  if (frame === undefined) return;
  callback(0, 0, frame.width, frame.height, frame.pageX, frame.pageY);
};
// The recording host's own `measure` is a no-op stub (it never speaks to Fabric, so it invents
// nothing) and would otherwise SHADOW the slot override above — the same gap that keeps
// host-instance.test.ts on the mirror. Forward it to the slot here, exactly what the real commit
// path does, so Pressable's responder-region measurement reaches the override.
fabric.measure = (node, callback) => slot.measure(node, callback);

beforeEach(() => {
  vi.useFakeTimers();
  fabric.reset();
  measuredFrame = undefined;
});
afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

// The responder is the Pressable's own non-box-none RCTView. `testID` disambiguates multiple
// simultaneously mounted Pressables; omitted retains the common single-Pressable lookup.
function responderHandle(testID?: string): unknown {
  const view = fabric.find(
    n =>
      n.viewName === 'RCTView' &&
      n.props.pointerEvents !== 'box-none' &&
      (testID === undefined || n.props.testID === testID),
  );
  if (!view)
    throw new Error('no matching RCTView (Pressable responder) was created');
  return view.instanceHandle;
}

// The latest committed props of the responder View (re-read after each commit — a live node's
// payload is always the current one).
function responderProps(): Record<string, unknown> {
  const node = live.findLive(
    live.appRoot(),
    n => n.viewName === 'RCTView' && n.payload.pointerEvents !== 'box-none',
  );
  if (node === undefined) throw new Error('no committed RCTView found');
  return node.payload;
}

function fire(handle: unknown, type: string): void {
  fabric.fireEvent(handle, type);
}

// A single-touch native event at a page coordinate; topTouchEnd reports the lifted finger
// only in changedTouches (touches is now empty), start/move keep it in both.
function fireAt(handle: unknown, type: string, x: number, y: number): void {
  const touch = {
    pageX: x,
    pageY: y,
    identifier: TOUCH_IDENTIFIER,
    timestamp: 0,
  };
  const touches = type === TOUCH_END ? [] : [touch];
  fabric.fireEvent(handle, type, {
    pageX: x,
    pageY: y,
    touches,
    changedTouches: [touch],
  });
}

function terminationGate(handle: unknown): IListener | undefined {
  if (!isSymbioteNode(handle)) return undefined;
  return listenerFor(handle, TERMINATION_REQUEST);
}

describe('React Pressable on the engine', () => {
  // A tap without enough drift to leave the retention region fires `onPress` exactly once
  it('synthesizes onPress on start + end', () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      <pressable
        onPress={() => {
          presses++;
        }}
      />,
    );
    const handle = responderHandle();
    fire(handle, TOUCH_START);
    fire(handle, TOUCH_END);
    expect(presses).toBe(1);
  });

  it('stays active across multiple touches and completes once on the final lift', () => {
    const order: string[] = [];
    mount(
      ROOT_TAG,
      <pressable
        onPressIn={() => order.push('in')}
        onPress={() => order.push('press')}
        onPressOut={() => order.push('out')}
      />,
    );
    const handle = responderHandle();
    const first = {
      identifier: 1,
      pageX: 10,
      pageY: 10,
      timestamp: 1,
      target: handle,
    };
    const second = {
      identifier: 2,
      pageX: 12,
      pageY: 10,
      timestamp: 2,
      target: handle,
    };

    fabric.fireEvent(handle, TOUCH_START, {
      changedTouches: [first],
      touches: [first],
    });
    fabric.fireEvent(handle, TOUCH_START, {
      changedTouches: [second],
      touches: [first, second],
    });
    expect(order).toEqual(['in']);

    fabric.fireEvent(handle, TOUCH_END, {
      changedTouches: [first],
      touches: [second],
    });
    expect(order).toEqual(['in']);

    fabric.fireEvent(handle, TOUCH_END, {
      changedTouches: [second],
      touches: [],
    });
    // The engine completes on the final lift. A higher-level Pressable implementation may retain
    // its active visual/onPressOut for RN's 130ms minimum duration, so assert completion by that
    // boundary rather than requiring a synchronous adapter callback.
    vi.advanceTimersByTime(130);
    expect(order).toEqual(['in', 'press', 'out']);
  });

  it('keeps simultaneous sibling Pressables independent', () => {
    const firstOrder: string[] = [];
    const siblingOrder: string[] = [];
    mount(
      ROOT_TAG,
      <>
        <pressable
          testID="first"
          onPressIn={() => firstOrder.push('in')}
          onPress={() => firstOrder.push('press')}
          onPressOut={() => firstOrder.push('out')}
        />
        <pressable
          testID="sibling"
          onPressIn={() => siblingOrder.push('in')}
          onPress={() => siblingOrder.push('press')}
          onPressOut={() => siblingOrder.push('out')}
        />
      </>,
    );
    const firstHandle = responderHandle('first');
    const siblingHandle = responderHandle('sibling');
    const first = {
      identifier: 1,
      pageX: 10,
      pageY: 10,
      timestamp: 1,
      target: firstHandle,
    };
    const sibling = {
      identifier: 2,
      pageX: 30,
      pageY: 10,
      timestamp: 2,
      target: siblingHandle,
    };

    fabric.fireEvent(firstHandle, TOUCH_START, {
      changedTouches: [first],
      touches: [first],
    });
    fabric.fireEvent(siblingHandle, TOUCH_START, {
      changedTouches: [sibling],
      touches: [first, sibling],
    });
    expect(firstOrder).toEqual(['in']);
    expect(siblingOrder).toEqual(['in']);

    fabric.fireEvent(siblingHandle, TOUCH_END, {
      changedTouches: [sibling],
      touches: [first],
    });
    vi.advanceTimersByTime(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(firstOrder).toEqual(['in']);
    expect(siblingOrder).toEqual(['in', 'press', 'out']);

    fabric.fireEvent(firstHandle, TOUCH_END, {
      changedTouches: [first],
      touches: [],
    });
    expect(firstOrder).toEqual(['in', 'press', 'out']);
  });

  // A disabled Pressable must not claim the responder or fire any feedback
  it('suppresses onPress when disabled', () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      <pressable
        disabled
        onPress={() => {
          presses++;
        }}
      />,
    );
    const handle = responderHandle();
    fire(handle, TOUCH_START);
    fire(handle, TOUCH_END);
    expect(presses).toBe(0);
  });

  // A held press fires `onLongPress` and no `onPress`, and the next quick tap must still work
  it('fires onLongPress once on a hold, suppresses the tap, and rearms for the next tap', () => {
    const DELAY = 500;
    let longPresses = 0;
    let presses = 0;
    mount(
      ROOT_TAG,
      <pressable
        delayLongPress={DELAY}
        onLongPress={() => {
          longPresses++;
        }}
        onPress={() => {
          presses++;
        }}
      />,
    );
    const handle = responderHandle();

    // (a) full hold cycle: long press fires once, the release does NOT count a tap.
    fire(handle, TOUCH_START);
    vi.advanceTimersByTime(DELAY);
    expect(longPresses).toBe(1);
    fire(handle, TOUCH_END);
    expect(presses).toBe(0);
    expect(longPresses).toBe(1);

    // (b) a second quick tap (released before DELAY) still fires onPress.
    fire(handle, TOUCH_START);
    fire(handle, TOUCH_END);
    expect(presses).toBe(1);
    expect(longPresses).toBe(1);
  });

  // The timer is cancelled on release, so a later advance cannot long-press a finished gesture
  it('does not long-press on a release before the delay', () => {
    const DELAY = 500;
    let longPresses = 0;
    mount(
      ROOT_TAG,
      <pressable
        delayLongPress={DELAY}
        onLongPress={() => {
          longPresses++;
        }}
      />,
    );
    const handle = responderHandle();
    fire(handle, TOUCH_START);
    fire(handle, TOUCH_END);
    vi.advanceTimersByTime(DELAY);
    expect(longPresses).toBe(0);
  });

  // The `disabled` fold is `foldPressableProps`, asserted in `pressable-payload.itest.ts`
  it('passes a11y props through untouched', () => {
    mount(
      ROOT_TAG,
      <pressable disabled accessibilityLabel="save" testID="save-btn" />,
    );
    const props = responderProps();
    expect(props.accessibilityLabel).toBe('save');
    expect(props.testID).toBe('save-btn');
  });

  // Fails if the `button` registration is dropped, role and state live in `button-payload.itest.ts`
  it('gives button its a11y label through the registration', () => {
    mount(
      ROOT_TAG,
      <button title="OK" disabled accessibilityLabel="confirm" />,
    );

    expect(responderProps().accessibilityLabel).toBe('confirm');
  });

  // why: RN's finger tracking is not pixel-perfect — a small wobble while holding a tap must
  // still count as a press (pressRetentionOffset radius), but a real drag/scroll-intent gesture
  // must drop it (early pressOut) so a Pressable inside a scrollable area doesn't fire spuriously.
  it('retains the press on a small drift and drops it past pressRetentionOffset', () => {
    let presses = 0;
    let pressOuts = 0;
    // hitSlop 0 + retention 30 -> threshold 30. A 10pt move retains; a 100pt move drops.
    mount(
      ROOT_TAG,
      <pressable
        hitSlop={0}
        pressRetentionOffset={30}
        onPress={() => {
          presses++;
        }}
        onPressOut={() => {
          pressOuts++;
        }}
      />,
    );
    const handle = responderHandle();

    // (a) small drift inside the retention region -> press still fires on release.
    measuredFrame = { width: 20, height: 20, pageX: 95, pageY: 95 };
    fireAt(handle, TOUCH_START, 100, 100);
    fireAt(handle, TOUCH_MOVE, 108, 106); // hypot(8,6) = 10 < 30 -> retained
    fireAt(handle, TOUCH_END, 108, 106);
    expect(presses).toBe(1);
    expect(pressOuts).toBe(0);
    vi.advanceTimersByTime(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(pressOuts).toBe(1);

    // (b) large drift past the region -> tap suppressed; pressOut keeps RN's active floor.
    presses = 0;
    pressOuts = 0;
    fireAt(handle, TOUCH_START, 100, 100);
    fireAt(handle, TOUCH_MOVE, 200, 100); // 100 > 30 -> drifted out
    expect(pressOuts).toBe(0);
    vi.advanceTimersByTime(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(pressOuts).toBe(1);
    fireAt(handle, TOUCH_END, 200, 100);
    expect(presses).toBe(0);
  });

  // `pressIn` waits for `unstable_pressDelay`, an early release still flushes the deferred press
  it('defers the pressed state with unstable_pressDelay', () => {
    const DELAY = 120;
    let pressIns = 0;
    let presses = 0;
    mount(
      ROOT_TAG,
      <pressable
        unstable_pressDelay={DELAY}
        onPressIn={() => {
          pressIns++;
        }}
        onPress={() => {
          presses++;
        }}
      />,
    );
    const handle = responderHandle();

    // (a) touch-down alone does NOT activate pressIn; it is deferred behind the timer.
    fireAt(handle, TOUCH_START, 50, 50);
    expect(pressIns).toBe(0);
    // (b) advancing past the delay fires the deferred pressIn.
    vi.advanceTimersByTime(DELAY);
    expect(pressIns).toBe(1);
    fireAt(handle, TOUCH_END, 50, 50);
    expect(presses).toBe(1);

    // (c) a release BEFORE the delay still flushes the deferred press.
    pressIns = 0;
    presses = 0;
    fireAt(handle, TOUCH_START, 50, 50);
    expect(pressIns).toBe(0);
    fireAt(handle, TOUCH_END, 50, 50); // released before advancing the timer
    expect(pressIns).toBe(1);
    expect(presses).toBe(1);
  });

  it('holds onPressOut for RN’s 130ms minimum active duration', () => {
    let pressOuts = 0;
    mount(
      ROOT_TAG,
      <pressable
        onPress={() => {}}
        onPressOut={() => {
          pressOuts++;
        }}
      />,
    );
    const handle = responderHandle();

    fire(handle, TOUCH_START);
    fire(handle, TOUCH_END);
    expect(pressOuts).toBe(0);
    vi.advanceTimersByTime(DEFAULT_MIN_PRESS_DURATION_MS - 1);
    expect(pressOuts).toBe(0);
    vi.advanceTimersByTime(1);
    expect(pressOuts).toBe(1);
  });

  // KNOWN RED — an engine gap, CROSS-ADAPTER: unmount skips `node.ts`'s `removeChild`, so
  // `markDetachCandidate` never fires and the tag's timers leak. Left failing on purpose — an
  // adapter-side workaround would be five copies of one engine fix.
  it('cancels a pending unstable_pressDelay timer on unmount', () => {
    let pressIns = 0;
    mount(
      ROOT_TAG,
      <pressable
        unstable_pressDelay={120}
        onPressIn={() => {
          pressIns++;
        }}
      />,
    );

    const handle = responderHandle();
    fire(handle, TOUCH_START);
    unmount(ROOT_TAG);
    vi.advanceTimersByTime(120);
    expect(pressIns).toBe(0);
    // Clear the test harness's process-global responder after proving teardown cancelled the timer.
    fire(handle, 'topTouchCancel');
  });

  // `pressRetentionOffset` is per-edge, so drift is judged against the measured frame
  it('tests the measured rect per-edge (asymmetric) for retention', () => {
    measuredFrame = { width: 100, height: 40, pageX: 0, pageY: 0 };
    let presses = 0;
    let pressOuts = 0;
    mount(
      ROOT_TAG,
      <pressable
        pressRetentionOffset={{ right: 40 }}
        onPress={() => {
          presses++;
        }}
        onPressOut={() => {
          pressOuts++;
        }}
      />,
    );
    const handle = responderHandle();

    // (a) x=130 is inside the right edge (100+40=140) -> retained, tap fires on release.
    fireAt(handle, TOUCH_START, 50, 20);
    fireAt(handle, TOUCH_MOVE, 130, 20);
    fireAt(handle, TOUCH_END, 130, 20);
    expect(presses).toBe(1);
    vi.advanceTimersByTime(DEFAULT_MIN_PRESS_DURATION_MS);

    // (b) y=80 is past the bottom edge (40+30=70) -> drifted out, tap dropped.
    presses = 0;
    pressOuts = 0;
    fireAt(handle, TOUCH_START, 50, 20);
    fireAt(handle, TOUCH_MOVE, 50, 80);
    expect(pressOuts).toBe(0);
    vi.advanceTimersByTime(DEFAULT_MIN_PRESS_DURATION_MS);
    expect(pressOuts).toBe(1);
    fireAt(handle, TOUCH_END, 50, 80);
    expect(presses).toBe(0);
  });

  // `cancelable={false}` refuses to yield the responder to a parent such as a ScrollView
  it('registers a termination gate returning false for cancelable={false}', () => {
    mount(ROOT_TAG, <pressable cancelable={false} onPress={() => {}} />);
    const gate = terminationGate(responderHandle());
    expect(gate, 'termination gate registered').toBeDefined();
    expect(gate!({ nativeEvent: {} })).toBe(false);
  });

  // The explicit opposite: the gate is still attached and resolves to true
  it('registers a termination gate returning true for cancelable', () => {
    mount(ROOT_TAG, <pressable cancelable onPress={() => {}} />);
    const gate = terminationGate(responderHandle());
    expect(gate, 'termination gate registered').toBeDefined();
    expect(gate!({ nativeEvent: {} })).toBe(true);
  });

  // An unset `cancelable` leaves RN's native default in charge, so no answer is forced
  // Asserted on the answer, since the behavior always installs one dispatcher
  it('forces no termination answer when cancelable is unset (RN implicit yes)', () => {
    mount(ROOT_TAG, <pressable onPress={() => {}} />);
    const gate = terminationGate(responderHandle());
    expect(gate?.({ nativeEvent: {} })).toBeUndefined();
  });

  // `onPressMove` fires on every move while live, whether or not it stays in the retention region
  it('fires onPressMove on every responder move while the press is live', () => {
    let moves = 0;
    mount(
      ROOT_TAG,
      <pressable
        onPressMove={() => {
          moves++;
        }}
        onPress={() => {}}
      />,
    );
    const handle = responderHandle();
    fireAt(handle, TOUCH_START, 50, 50);
    fireAt(handle, TOUCH_MOVE, 51, 50);
    fireAt(handle, TOUCH_MOVE, 52, 50);
    fireAt(handle, TOUCH_END, 52, 50);
    expect(moves).toBe(2);
  });

  // `android_ripple` is inert off Android, so no ripple View wraps the child (vitest runs as iOS)
  it('does not wrap the child in a ripple View for android_ripple on this (iOS-resolved) host', () => {
    mount(
      ROOT_TAG,
      <pressable android_ripple={{ color: '#f00' }} onPress={() => {}}>
        <button title="inner" />
      </pressable>,
    );
    const rippleCarrier = fabric.find(
      n =>
        n.props.nativeBackgroundAndroid !== undefined ||
        n.props.nativeForegroundAndroid !== undefined,
    );
    expect(rippleCarrier).toBeUndefined();
  });

  // Both `accessible` cases live in `pressable-payload.itest.ts`, the rule is the engine's
});
