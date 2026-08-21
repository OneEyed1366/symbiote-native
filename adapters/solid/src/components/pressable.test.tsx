// Solid twin of adapters/react/src/components/pressable/pressable.test.tsx and the Svelte
// smoke test. Drives REAL compiled Solid JSX (the vitest `solid` project runs the same
// babel-preset-solid options the app-facing babel-preset.cjs pins) through the universal renderer
// into the fake Fabric slot, firing the raw touch primitives the way native would
// (topTouchStart/Move/End on the responder node's instanceHandle).
//
// The press machine itself (createPressHandlers/createPressRuntime — the long-press timer, the
// unstable_pressDelay deferral, the drift test, the suppression flags) is shared verbatim with
// every other adapter, so the parity half below re-walks React's cases only to prove the SOLID
// wiring reaches them: the responder listeners actually land on the host node, the IPressHost
// bridge (setPressed / getMeasureFn / schedule) is connected, and the retention measure resolves
// through a real host ref.
//
// The last group has no React counterpart and is the reason this file is not ceremony: Solid runs
// a component body ONCE and has no reconciler, so "a prop read after mount still reaches the host",
// "a static child subtree survives a press", and "a render-prop child re-runs on one" are real,
// silently-breakable claims here rather than tautologies.
//
// Pressable measures its responder rect on grant (RN's _measureResponderRegion); the shared
// recorder has no `measure`, so a configurable one is grafted onto the live slot before any mount.
//
// No Negative group: nothing here throws. `disabled` suppresses a press silently (a Positive
// contract — it completes without error, the callback just never fires), it never rejects.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../render';
import { Pressable } from './pressable';

const ROOT_TAG = 814;
const TARGET = 'pressable-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_MOVE = 'topTouchMove';
const TOUCH_END = 'topTouchEnd';
const TOUCH_IDENTIFIER = 1;
const TERMINATION_REQUEST = 'responderTerminationRequest';
const LONG_PRESS_MS = 500;
const PRESS_DELAY_MS = 120;

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

// The engine commits on a microtask (renderer.ts's requestCommit), so nothing reaches the fake slot
// until that queue drains. `setTimeout` is frozen under the fake timers the press machine's own
// timers need, but vitest does not fake queueMicrotask — so awaiting a resolved promise, not a
// timer, is what flushes a commit here.
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
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

// The responder is Pressable's own RCTView, found by the testID every mount below sets — the tree
// also carries the engine's synthetic box-none root, and (in the ripple case) an inner View.
function createdTarget(): IFakeNode {
  const node = fabric.find(n => n.props.testID === TARGET);
  if (node === undefined)
    throw new Error(`no node created with testID=${TARGET}`);
  return node;
}

function responderHandle(): unknown {
  return createdTarget().instanceHandle;
}

function findCommitted(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  function walk(node: IFakeNode): IFakeNode | undefined {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const hit = walk(child);
      if (hit !== undefined) return hit;
    }
    return undefined;
  }
  for (const root of fabric.committed) {
    const hit = walk(root);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

// `fabric.find` reads the immutable createNode snapshot, so anything asserted AFTER an update has
// to come off the live committed tree instead (clone-on-write hands back a new object).
function committedTargetProps(): Record<string, unknown> {
  const node = findCommitted(n => n.props.testID === TARGET);
  if (node === undefined)
    throw new Error(`no committed node with testID=${TARGET}`);
  return node.props;
}

function fire(handle: unknown, type: string): void {
  fabric.fireEvent(handle, type);
}

// A single-touch native event at a page coordinate; topTouchEnd reports the lifted finger only in
// changedTouches (touches is now empty), start/move keep it in both.
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
  const gate: unknown = listeners.get(TERMINATION_REQUEST);
  return typeof gate === 'function' ? gate : undefined;
}

describe('Solid Pressable on the engine', () => {
  describe('Positive — the shared press machine, driven through the Solid lifecycle', () => {
    // why: a tap is the entire product contract of Pressable — start+end without enough drift to
    // fall out of the retention region must fire exactly one onPress, never zero or more than one.
    it('synthesizes onPress/onPressIn/onPressOut on a start + end cycle', async () => {
      let presses = 0;
      let pressIns = 0;
      let pressOuts = 0;
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          onPress={() => {
            presses++;
          }}
          onPressIn={() => {
            pressIns++;
          }}
          onPressOut={() => {
            pressOuts++;
          }}
        />
      ));
      await flush();

      const handle = responderHandle();
      fire(handle, TOUCH_START);
      expect(pressIns).toBe(1);
      expect(presses).toBe(0);

      fire(handle, TOUCH_END);
      expect(pressOuts).toBe(1);
      expect(presses).toBe(1);
    });

    // why: RN's disabled Pressable must not claim the responder or fire feedback at all, and must
    // still report itself disabled to a screen reader — a disabled control that keeps reacting is
    // both a product and an a11y bug.
    it('suppresses the press and folds accessibilityState.disabled when disabled', async () => {
      let presses = 0;
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          disabled
          onPress={() => {
            presses++;
          }}
        />
      ));
      await flush();

      expect(accessibilityDisabled(committedTargetProps())).toBe(true);
      const handle = responderHandle();
      fire(handle, TOUCH_START);
      fire(handle, TOUCH_END);
      expect(presses).toBe(0);
    });

    // why: the disabled fold must not leak — an enabled Pressable must NOT report
    // accessibilityState.disabled just because the fold ran, and unrelated a11y props must reach
    // the native node untouched.
    it('passes a11y props through and leaves an enabled Pressable undisabled', async () => {
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          accessibilityLabel="save"
          aria-hidden={false}
        />
      ));
      await flush();

      const props = committedTargetProps();
      expect(props.accessibilityLabel).toBe('save');
      expect(accessibilityDisabled(props)).not.toBe(true);
    });

    // why: RN's long-press is exclusive with a tap — a held press must fire onLongPress and must
    // NOT also count as a completed onPress on release, but the machine must rearm so a later,
    // separate quick tap still works (a stuck "already long-pressed" flag would be a bug).
    it('fires onLongPress once on a hold, suppresses the tap, and rearms for the next tap', async () => {
      let longPresses = 0;
      let presses = 0;
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          delayLongPress={LONG_PRESS_MS}
          onLongPress={() => {
            longPresses++;
          }}
          onPress={() => {
            presses++;
          }}
        />
      ));
      await flush();
      const handle = responderHandle();

      fire(handle, TOUCH_START);
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(longPresses).toBe(1);
      fire(handle, TOUCH_END);
      expect(presses).toBe(0);

      fire(handle, TOUCH_START);
      fire(handle, TOUCH_END);
      expect(presses).toBe(1);
      expect(longPresses).toBe(1);
    });

    // why: releasing before delayLongPress elapses is an ordinary tap — the timer must be
    // CANCELLED on release, not merely ignored, or a later unrelated advance would still fire a
    // long press for an already-finished gesture.
    it('does not long-press on a release before the delay', async () => {
      let longPresses = 0;
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          delayLongPress={LONG_PRESS_MS}
          onLongPress={() => {
            longPresses++;
          }}
        />
      ));
      await flush();
      const handle = responderHandle();

      fire(handle, TOUCH_START);
      fire(handle, TOUCH_END);
      vi.advanceTimersByTime(LONG_PRESS_MS);
      expect(longPresses).toBe(0);
    });

    // why: RN's finger tracking is not pixel-perfect — a small wobble while holding must still
    // count as a press, but a real drag must drop it (early pressOut) so a Pressable inside a
    // scrollable area does not fire spuriously. No measured frame here, so this is the radius
    // fallback: hitSlop 0 + retention 30 -> threshold 30.
    it('retains the press on a small drift and drops it past pressRetentionOffset', async () => {
      let presses = 0;
      let pressOuts = 0;
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          hitSlop={0}
          pressRetentionOffset={30}
          onPress={() => {
            presses++;
          }}
          onPressOut={() => {
            pressOuts++;
          }}
        />
      ));
      await flush();
      const handle = responderHandle();

      fireAt(handle, TOUCH_START, 100, 100);
      fireAt(handle, TOUCH_MOVE, 108, 106); // hypot(8,6) = 10 < 30 -> retained
      fireAt(handle, TOUCH_END, 108, 106);
      expect(presses).toBe(1);
      expect(pressOuts).toBe(1);

      presses = 0;
      pressOuts = 0;
      fireAt(handle, TOUCH_START, 100, 100);
      fireAt(handle, TOUCH_MOVE, 200, 100); // 100 > 30 -> drifted out
      expect(pressOuts).toBe(1);
      fireAt(handle, TOUCH_END, 200, 100);
      expect(presses).toBe(0);
    });

    // why: pressRetentionOffset can be set per-edge, so the drift test must run against the real
    // measured frame rather than a symmetric approximation. This is also the only test that proves
    // IPressHost.getMeasureFn is wired to a LIVE host ref: with a broken ref the machine silently
    // falls back to the radius test and (a) below would drop the press instead of retaining it.
    it('tests the measured rect per-edge (asymmetric) for retention', async () => {
      measuredFrame = { width: 100, height: 40, pageX: 0, pageY: 0 };
      let presses = 0;
      let pressOuts = 0;
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          pressRetentionOffset={{ right: 40 }}
          onPress={() => {
            presses++;
          }}
          onPressOut={() => {
            pressOuts++;
          }}
        />
      ));
      await flush();
      const handle = responderHandle();

      // (a) x=130 is inside the right edge (100+40=140) -> retained, tap fires on release.
      fireAt(handle, TOUCH_START, 50, 20);
      fireAt(handle, TOUCH_MOVE, 130, 20);
      fireAt(handle, TOUCH_END, 130, 20);
      expect(presses).toBe(1);

      // (b) y=80 is past the bottom edge (40+30=70) -> drifted out, early pressOut, tap dropped.
      presses = 0;
      pressOuts = 0;
      fireAt(handle, TOUCH_START, 50, 20);
      fireAt(handle, TOUCH_MOVE, 50, 80);
      expect(pressOuts).toBe(1);
      fireAt(handle, TOUCH_END, 50, 80);
      expect(presses).toBe(0);
    });

    // why: unstable_pressDelay exists so a fast swipe-through does not flash every Pressable it
    // crosses as "pressed" — pressIn must wait for the delay, but a release before the delay
    // elapses must still FLUSH the deferred press rather than silently dropping the tap. Also
    // proves IPressHost.schedule is wired: without it the machine would never activate at all.
    it('defers the pressed state with unstable_pressDelay and flushes an early release', async () => {
      let pressIns = 0;
      let presses = 0;
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          unstable_pressDelay={PRESS_DELAY_MS}
          onPressIn={() => {
            pressIns++;
          }}
          onPress={() => {
            presses++;
          }}
        />
      ));
      await flush();
      const handle = responderHandle();

      fireAt(handle, TOUCH_START, 50, 50);
      expect(pressIns).toBe(0);
      vi.advanceTimersByTime(PRESS_DELAY_MS);
      expect(pressIns).toBe(1);
      fireAt(handle, TOUCH_END, 50, 50);
      expect(presses).toBe(1);

      pressIns = 0;
      presses = 0;
      fireAt(handle, TOUCH_START, 50, 50);
      expect(pressIns).toBe(0);
      fireAt(handle, TOUCH_END, 50, 50); // released before advancing the timer
      expect(pressIns).toBe(1);
      expect(presses).toBe(1);
    });

    // why: onPressMove is a distinct RN callback from the retention drift bookkeeping — it must
    // fire on every responder move while the press is live, independent of whether the move stays
    // inside or outside the retention region.
    it('fires onPressMove on every responder move while the press is live', async () => {
      let moves = 0;
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          onPressMove={() => {
            moves++;
          }}
          onPress={() => {}}
        />
      ));
      await flush();
      const handle = responderHandle();

      fireAt(handle, TOUCH_START, 50, 50);
      fireAt(handle, TOUCH_MOVE, 51, 50);
      fireAt(handle, TOUCH_MOVE, 52, 50);
      fireAt(handle, TOUCH_END, 52, 50);
      expect(moves).toBe(2);
    });

    // why: cancelable={false} means "I refuse to yield the responder to a parent (e.g. a
    // ScrollView) that asks to take over". The gate is a RESPONDER event, which no ViewConfig
    // declares — it reaches the node only because routeProp knows the JS responder protocol
    // (symbiote-engine-core §2). An adapter-side `onX` check would have routed it to setProp, where
    // it would sit as a dead prop and the Pressable would yield anyway.
    it('registers a termination gate returning false for cancelable={false}', async () => {
      mount(ROOT_TAG, () => (
        <Pressable testID={TARGET} cancelable={false} onPress={() => {}} />
      ));
      await flush();
      const gate = terminationGate(responderHandle());
      expect(gate, 'termination gate registered').toBeDefined();
      expect(gate?.({ nativeEvent: {} })).toBe(false);
    });

    // why: cancelable={true} is the explicit opposite — the gate must still be attached (not
    // omitted, which would defer to RN's own default) and must resolve to true.
    it('registers a termination gate returning true for cancelable', async () => {
      mount(ROOT_TAG, () => (
        <Pressable testID={TARGET} cancelable onPress={() => {}} />
      ));
      await flush();
      const gate = terminationGate(responderHandle());
      expect(gate, 'termination gate registered').toBeDefined();
      expect(gate?.({ nativeEvent: {} })).toBe(true);
    });

    // why: leaving `cancelable` unset must leave RN's own native default in charge — attaching a
    // gate at all (even one resolving to true) would override that default with our own opinion.
    it('registers no termination gate when cancelable is unset (RN implicit yes)', async () => {
      mount(ROOT_TAG, () => <Pressable testID={TARGET} onPress={() => {}} />);
      await flush();
      expect(terminationGate(responderHandle())).toBeUndefined();
    });

    // why: android_ripple is gated on Platform.OS === 'android' and must be inert elsewhere (RN
    // Pressable.js). Headless vitest resolves Platform.OS to 'ios', so this exercises the real
    // "inert" branch: no ripple prop anywhere AND no extra wrapper node around the child.
    it('does not wrap the child in a ripple View on this (iOS-resolved) host', async () => {
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          android_ripple={{ color: '#f00' }}
          onPress={() => {}}
        >
          <symbiote-view testID="ripple-child" />
        </Pressable>
      ));
      await flush();

      const rippleCarrier = fabric.find(
        n =>
          n.props.nativeBackgroundAndroid !== undefined ||
          n.props.nativeForegroundAndroid !== undefined,
      );
      expect(rippleCarrier).toBeUndefined();
      const child = findCommitted(n => n.props.testID === 'ripple-child');
      expect(child, 'the child mounts unwrapped').toBeDefined();
      expect(
        findCommitted(n => n.props.testID === TARGET)?.children,
      ).toHaveLength(1);
    });

    // why: android_disableSound is a real native prop, not a JS concern — it has to reach Fabric
    // under RN's own key, and must be absent (never `false`) when the caller did not set it, or
    // Android would read an opinion the app never expressed.
    it('forwards android_disableSound under RN’s own key, and omits it when unset', async () => {
      mount(ROOT_TAG, () => (
        <Pressable testID={TARGET} android_disableSound onPress={() => {}} />
      ));
      await flush();
      expect(committedTargetProps().android_disableSound).toBe(true);

      unmount(ROOT_TAG);
      fabric.reset();
      mount(ROOT_TAG, () => <Pressable testID={TARGET} onPress={() => {}} />);
      await flush();
      expect('android_disableSound' in committedTargetProps()).toBe(false);
    });

    // why: the user's own press callbacks are plain JS. `onPress` happens to be a real View event
    // so it would be swallowed as a listener, but `onLongPress`/`onPressMove` and the plain
    // numbers (delayLongPress, unstable_pressDelay) are NOT — leaking a function onto the native
    // prop bag crashes Android's folly::dynamic serializer, and leaking the numbers sends Fabric
    // props it has no attribute for.
    it('never forwards its own config props onto the native prop bag', async () => {
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          delayLongPress={LONG_PRESS_MS}
          unstable_pressDelay={PRESS_DELAY_MS}
          pressRetentionOffset={30}
          hitSlop={8}
          onLongPress={() => {}}
          onPressMove={() => {}}
          onHoverIn={() => {}}
          delayHoverIn={10}
        />
      ));
      await flush();

      const props = committedTargetProps();
      for (const key of [
        'delayLongPress',
        'unstable_pressDelay',
        'pressRetentionOffset',
        'onLongPress',
        'onPressMove',
        'onHoverIn',
        'delayHoverIn',
        'android_ripple',
      ]) {
        expect(key in props, `${key} must not reach Fabric`).toBe(false);
      }
      // hitSlop is the deliberate exception: the machine reads it AND native needs it to enlarge
      // the touch target, so it is the one config prop that DOES forward.
      expect(props.hitSlop).toBe(8);
    });
  });

  describe('Positive — the Solid lifecycle itself', () => {
    // why: Solid runs a component body ONCE and has no reconciler, so a prop read at setup would
    // freeze the Pressable at its mount-time config while every parity test above still passed.
    // Toggling `disabled` after mount also exercises the vanished-key path: buildPressableListeners
    // returns an EMPTY bag when disabled, and only View's withStableKeys widening turns those gone
    // keys into an `undefined` routeProp treats as a delete
    // (.claude/rules/solid-descriptor-bridge.md §1). Without it the old listeners would survive and
    // the press would keep firing.
    it('drops the responder listeners when disabled flips after mount', async () => {
      const [disabled, setDisabled] = createSignal(false);
      let presses = 0;
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          disabled={disabled()}
          onPress={() => {
            presses++;
          }}
        />
      ));
      await flush();
      const handle = responderHandle();

      fire(handle, TOUCH_START);
      fire(handle, TOUCH_END);
      expect(presses).toBe(1);

      setDisabled(true);
      await flush();

      expect(accessibilityDisabled(committedTargetProps())).toBe(true);
      fire(handle, TOUCH_START);
      fire(handle, TOUCH_END);
      expect(presses, 'a disabled Pressable stops responding').toBe(1);
    });

    // why: children-as-a-function-of-press-state is RN's contract and Solid's half of it is
    // hand-wired here (there is no reconciler to re-run it). The child function itself runs ONCE —
    // what must reach the caller on BOTH edges of the gesture is the accessor it was handed, read
    // from inside the leaf.
    it('feeds a render-prop child the live pressed state through its accessor', async () => {
      mount(ROOT_TAG, () => (
        <Pressable testID={TARGET} onPress={() => {}}>
          {state => (
            <symbiote-view testID={state().pressed ? 'pressed' : 'idle'} />
          )}
        </Pressable>
      ));
      await flush();
      expect(findCommitted(n => n.props.testID === 'idle')).toBeDefined();

      const handle = responderHandle();
      fire(handle, TOUCH_START);
      await flush();
      expect(findCommitted(n => n.props.testID === 'pressed')).toBeDefined();

      fire(handle, TOUCH_END);
      await flush();
      expect(findCommitted(n => n.props.testID === 'idle')).toBeDefined();
    });

    // why: `typeof children === 'function'` cannot tell RN's render prop from an ordinary Solid
    // JSX child, because JSX.Element also covers a zero-argument accessor. The render prop is
    // called once and UNTRACKED, so mistaking a bare accessor for one freezes it at its first
    // value — a permanently stale subtree with nothing to notice it. Arity is what separates them.
    // The signal is read at the accessor's TOP LEVEL (it picks which element to return), which is
    // the only shape untrack can actually freeze — a dynamic attribute inside the returned JSX
    // gets its own render effect and stays reactive either way.
    it('keeps a zero-argument accessor child reactive', async () => {
      const [flipped, setFlipped] = createSignal(false);
      mount(ROOT_TAG, () => (
        <Pressable testID={TARGET} onPress={() => {}}>
          {() =>
            flipped() ? (
              <symbiote-view testID="second" />
            ) : (
              <symbiote-view testID="first" />
            )
          }
        </Pressable>
      ));
      await flush();
      expect(findCommitted(n => n.props.testID === 'first')).toBeDefined();

      setFlipped(true);
      await flush();
      expect(findCommitted(n => n.props.testID === 'second')).toBeDefined();
      expect(findCommitted(n => n.props.testID === 'first')).toBeUndefined();
    });

    // why: the counterpart, and the one that pins the `typeof children === 'function'` gate in
    // place. A STATIC subtree must not be re-created on a press: reading `pressed` unconditionally
    // in resolveChildren would put the press signal inside the enclosing render effect, and every
    // touch would tear the whole child subtree down and rebuild it — invisible to every other
    // test here, and on a device a flash plus a lost native focus/scroll position.
    it('does not re-create a static child subtree on a press', async () => {
      mount(ROOT_TAG, () => (
        <Pressable testID={TARGET} onPress={() => {}}>
          <symbiote-view testID="static-child" />
        </Pressable>
      ));
      await flush();
      const createdAtMount = fabric.counts.createNode;

      const handle = responderHandle();
      fire(handle, TOUCH_START);
      await flush();
      fire(handle, TOUCH_END);
      await flush();

      expect(fabric.counts.createNode, 'the child kept its identity').toBe(
        createdAtMount,
      );
    });

    // why: `style` as a function of press state is the other half of the same contract, and it
    // must reach the SAME native node rather than a replacement — the style flows through View's
    // prop bag, so a press updates props on the live element instead of remounting it.
    it('re-resolves a function style against the live pressed state on the same node', async () => {
      mount(ROOT_TAG, () => (
        <Pressable
          testID={TARGET}
          onPress={() => {}}
          style={state => ({ opacity: state.pressed ? 0.5 : 1 })}
        />
      ));
      await flush();
      const createdAtMount = fabric.counts.createNode;
      expect(committedTargetProps().opacity).toBe(1);

      const handle = responderHandle();
      fire(handle, TOUCH_START);
      await flush();
      expect(committedTargetProps().opacity).toBe(0.5);
      expect(fabric.counts.createNode, 'the responder kept its identity').toBe(
        createdAtMount,
      );

      fire(handle, TOUCH_END);
      await flush();
      expect(committedTargetProps().opacity).toBe(1);
    });
  });
});
