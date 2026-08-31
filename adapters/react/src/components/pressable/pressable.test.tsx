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
import { mount, unmount, Pressable, Button } from '@symbiote-native/react';
import { DEFAULT_MIN_PRESS_DURATION_MS } from '@symbiote-native/components';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 110;
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';
const TOUCH_IDENTIFIER = 1;
const TERMINATION_REQUEST = 'responderTerminationRequest';

// The frame slot.measure reports; undefined disables measure (the radius fallback path).
let measuredFrame:
  { width: number; height: number; pageX: number; pageY: number } | undefined;

const fabric = installFabric();
const slot = globalThis.nativeFabricUIManager;
if (slot === undefined) throw new Error('fabric slot was not installed');
slot.measure = (_node, callback) => {
  const frame = measuredFrame;
  if (frame === undefined) return;
  callback(0, 0, frame.width, frame.height, frame.pageX, frame.pageY);
};

beforeEach(() => {
  vi.useFakeTimers();
  fabric.reset();
  measuredFrame = undefined;
});
afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

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

// The latest committed props of the responder View (re-read after each commit).
function responderProps(): Record<string, unknown> {
  function find(node: IFakeNode): IFakeNode | undefined {
    if (node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none')
      return node;
    for (const child of node.children) {
      const hit = find(child);
      if (hit) return hit;
    }
    return undefined;
  }
  for (const root of fabric.committed) {
    const hit = find(root);
    if (hit) return hit.props;
  }
  throw new Error('no committed RCTView found');
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

function accessibilityDisabled(props: Record<string, unknown>): unknown {
  const state = props.accessibilityState;
  return isRecord(state) ? state.disabled : undefined;
}

function terminationGate(
  handle: unknown,
): ((event: unknown) => unknown) | undefined {
  if (!isRecord(handle)) return undefined;
  const listeners = handle.listeners;
  if (!(listeners instanceof Map)) return undefined;
  const gate = listeners.get(TERMINATION_REQUEST);
  return typeof gate === 'function' ? gate : undefined;
}

describe('React Pressable on the engine', () => {
  // why: a tap is the entire product contract of Pressable — start+end without enough drift to
  // fall out of the retention region must fire exactly one onPress, never zero or more than one.
  it('synthesizes onPress on start + end', () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      <Pressable
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
      <Pressable
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
        <Pressable
          testID="first"
          onPressIn={() => firstOrder.push('in')}
          onPress={() => firstOrder.push('press')}
          onPressOut={() => firstOrder.push('out')}
        />
        <Pressable
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

  // why: RN's disabled Pressable must not claim the responder or fire feedback at all — a
  // disabled control that still visually/behaviorally reacts is a real a11y and product bug.
  it('suppresses onPress when disabled', () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      <Pressable
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

  // why: RN's long-press is exclusive with a tap — a held press must fire onLongPress and
  // must NOT also count as a completed onPress on release, but the machine must rearm so a
  // later, separate quick tap still works (a stuck "already long-pressed" flag would be a bug).
  it('fires onLongPress once on a hold, suppresses the tap, and rearms for the next tap', () => {
    const DELAY = 500;
    let longPresses = 0;
    let presses = 0;
    mount(
      ROOT_TAG,
      <Pressable
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

  // why: releasing before delayLongPress elapses is an ordinary tap, not a long-press — the
  // timer must be cancelled on release, not merely ignored, or a later unrelated advance could
  // still fire a long-press for an already-finished gesture.
  it('does not long-press on a release before the delay', () => {
    const DELAY = 500;
    let longPresses = 0;
    mount(
      ROOT_TAG,
      <Pressable
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

  // why: resolveDisabledAccessibilityState (core/components) folds `disabled` into the
  // accessibilityState it's handed; this proves the fold actually reaches the committed native
  // node through the View wiring, and that unrelated a11y props pass through untouched.
  it('reports accessibilityState.disabled and passes a11y props through', () => {
    mount(
      ROOT_TAG,
      <Pressable disabled accessibilityLabel="save" testID="save-btn" />,
    );
    const props = responderProps();
    expect(accessibilityDisabled(props)).toBe(true);
    expect(props.accessibilityLabel).toBe('save');
    expect(props.testID).toBe('save-btn');
  });

  // why: Button is a thin Pressable wrapper; a screen reader must announce it as a button and
  // as disabled when `disabled` is set — this proves that mapping survives Button → Pressable →
  // View, not just Pressable's own accessibilityState fold tested above.
  it('gives Button role=button, accessible, and a disabled a11y state', () => {
    mount(
      ROOT_TAG,
      <Button title="OK" disabled accessibilityLabel="confirm" />,
    );
    const props = responderProps();
    expect(props.accessibilityRole).toBe('button');
    expect(props.accessible).toBe(true);
    expect(accessibilityDisabled(props)).toBe(true);
    expect(props.accessibilityLabel).toBe('confirm');
  });

  // why: the disabled-fold above must not leak — an enabled Button must NOT report
  // accessibilityState.disabled just because `disabled` was folded through Pressable's logic
  // (the fold is untouched, not defaulted-to-true, when `disabled` is unset).
  it('keeps an enabled Button role=button and not disabled', () => {
    mount(ROOT_TAG, <Button title="Go" onPress={() => {}} />);
    const props = responderProps();
    expect(props.accessibilityRole).toBe('button');
    expect(accessibilityDisabled(props)).not.toBe(true);
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
      <Pressable
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

  // why: unstable_pressDelay exists so a fast swipe-through doesn't flash every Pressable it
  // crosses as "pressed" — pressIn must wait for the delay, but a release before the delay
  // elapses must still flush the deferred press rather than silently dropping the tap.
  it('defers the pressed state with unstable_pressDelay', () => {
    const DELAY = 120;
    let pressIns = 0;
    let presses = 0;
    mount(
      ROOT_TAG,
      <Pressable
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
      <Pressable
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

  it('cancels a pending unstable_pressDelay timer on unmount', () => {
    let pressIns = 0;
    mount(
      ROOT_TAG,
      <Pressable
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

  // why: pressRetentionOffset can be set per-edge (not just a uniform radius) — the drift test
  // must measure against the real per-edge frame, not a symmetric approximation, or an
  // asymmetric layout (e.g. a wide short button) would retain/drop on the wrong side.
  it('tests the measured rect per-edge (asymmetric) for retention', () => {
    measuredFrame = { width: 100, height: 40, pageX: 0, pageY: 0 };
    let presses = 0;
    let pressOuts = 0;
    mount(
      ROOT_TAG,
      <Pressable
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

  // why: cancelable={false} means "I refuse to yield the responder to a parent (e.g. a
  // ScrollView) that asks to take over" — the wiring must actually attach a gate function that
  // returns false, not merely accept the prop (buildPressableListeners is already unit-tested at
  // core; this proves the adapter threads its result onto the real responder node).
  it('registers a termination gate returning false for cancelable={false}', () => {
    mount(ROOT_TAG, <Pressable cancelable={false} onPress={() => {}} />);
    const gate = terminationGate(responderHandle());
    expect(gate, 'termination gate registered').toBeDefined();
    expect(gate!({ nativeEvent: {} })).toBe(false);
  });

  // why: cancelable={true} is the explicit opposite of the case above — the gate must still be
  // attached (not omitted, which would defer to RN's own default) and must resolve to true.
  it('registers a termination gate returning true for cancelable', () => {
    mount(ROOT_TAG, <Pressable cancelable onPress={() => {}} />);
    const gate = terminationGate(responderHandle());
    expect(gate, 'termination gate registered').toBeDefined();
    expect(gate!({ nativeEvent: {} })).toBe(true);
  });

  // why: leaving `cancelable` unset must leave RN's own native default in charge — attaching a
  // gate at all (even one resolving to true) would override that default with our own opinion.
  it('registers no termination gate when cancelable is unset (RN implicit yes)', () => {
    mount(ROOT_TAG, <Pressable onPress={() => {}} />);
    expect(terminationGate(responderHandle())).toBeUndefined();
  });

  // why: onPressMove is a distinct RN callback from the retention drift bookkeeping above — it
  // must fire on every responder move while the press is live, independent of whether the move
  // stays inside or outside the retention region.
  it('fires onPressMove on every responder move while the press is live', () => {
    let moves = 0;
    mount(
      ROOT_TAG,
      <Pressable
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

  // why: android_ripple (core/components' rippleProps) is gated on Platform.OS === 'android' and
  // must be a no-op elsewhere (RN Pressable.js: "inert on iOS") — this proves the adapter does
  // NOT wrap the child in an extra ripple View when the platform gate is closed, rather than
  // assuming the gate works from reading the source. Headless vitest resolves Platform.OS to
  // 'ios' (core/engine/src/platform/index.ts has no Metro to pick .android — see that file's own
  // comment), so this exercises the real "inert" branch, not a fake one.
  it('does not wrap the child in a ripple View for android_ripple on this (iOS-resolved) host', () => {
    mount(
      ROOT_TAG,
      <Pressable android_ripple={{ color: '#f00' }} onPress={() => {}}>
        <Button title="inner" />
      </Pressable>,
    );
    const rippleCarrier = fabric.find(
      n =>
        n.props.nativeBackgroundAndroid !== undefined ||
        n.props.nativeForegroundAndroid !== undefined,
    );
    expect(rippleCarrier).toBeUndefined();
  });
});
