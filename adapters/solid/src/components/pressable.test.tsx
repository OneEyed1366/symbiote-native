// `pressable` as a TAG, through Solid's own renderer — the suite that was
// `components/pressable.test.tsx` while a component composed View. Drives REAL compiled Solid JSX
// through the universal renderer into the recording host, firing the raw touch primitives the way
// native would (topTouchStart/Move/End on the responder node's instanceHandle).
//
// THE SUBJECT IS THE BARE TAG — there is no Pressable component any more. The press machine
// itself (createPressHandlers/createPressRuntime — the long-press timer, the unstable_pressDelay
// deferral, the drift test, the suppression flags) lives on the engine node
// (`core/components/src/behaviors/pressable.ts`) and is fully unit-tested there; this file proves
// the SOLID WIRING: compiled JSX reaches the tag, the responder listeners land on the host node,
// and the retention measure resolves through a real host ref.
//
// The last group has no React counterpart and is the reason this file is not ceremony: Solid runs
// a component body ONCE elsewhere, but these are bare tags with no body to freeze — "a prop read
// after mount still reaches the host" and "a static child subtree survives a press" are real,
// silently-breakable claims about the SOLID renderer rather than tautologies.
//
// Pressable measures its responder rect on grant (RN's _measureResponderRegion); the recording
// host's own `measure` is a permanent no-op, so a configurable one is grafted onto the host
// directly before any mount.
//
// No Negative group: nothing here throws. `disabled` suppresses a press silently (a Positive
// contract — it completes without error, the callback just never fires), it never rejects.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MIN_PRESS_DURATION_MS } from '@symbiote-native/components';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: the press machine lives in the tag's behavior, and only this module installs
// it. An app reaches it through the package barrel; a test importing render does not.
import '../register';
import { mount, unmount } from '../render';

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

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
// `node.measure()` resolves through `treeHost().measure`, not the global Fabric slot — grafting
// the slot (as `installFabric`'s fake host needed) is dead here, because the recording host
// answers `measure` with its own permanent no-op that shadows it
// (`.docs/mirror-elimination.md`, the `host-instance.test.ts` note on `measure`/`measureInWindow`/
// `measureLayout`). Overriding the host's own method in place is what actually reaches the call.
fabric.measure = (_node, callback) => {
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

// The responder is the pressable tag's own RCTView, found by the testID every mount below sets —
// the tree also carries the engine's synthetic box-none root.
function createdTarget(): { instanceHandle: unknown } {
  const node = fabric.find(n => n.props.testID === TARGET);
  if (node === undefined)
    throw new Error(`no node created with testID=${TARGET}`);
  return node;
}

function responderHandle(): unknown {
  return createdTarget().instanceHandle;
}

function findCommitted(
  predicate: (node: ILiveNode) => boolean,
): ILiveNode | undefined {
  return live.findLive(live.appRoot(), predicate);
}

// The live tree re-derives on every read, so anything asserted after an update is safe off it —
// no more "frozen at first commit" caveat.
function committedTargetProps(): Record<string, unknown> {
  const node = findCommitted(n => n.payload.testID === TARGET);
  if (node === undefined)
    throw new Error(`no committed node with testID=${TARGET}`);
  return node.payload;
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
        <pressable
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
      expect(pressOuts).toBe(0);
      expect(presses).toBe(1);
      vi.advanceTimersByTime(DEFAULT_MIN_PRESS_DURATION_MS);
      expect(pressOuts).toBe(1);
    });

    // why: RN's disabled Pressable must not claim the responder or fire feedback at all, and must
    // still report itself disabled to a screen reader — a disabled control that keeps reacting is
    // both a product and an a11y bug.
    // The a11y half of this case is the engine's rule now (`foldPressableProps`) and is asserted in
    // `core/engine/cpp/tests/js/pressable-payload.itest.ts`; what is left here is the half that is
    // genuinely Solid's — that a disabled tag reaches the press machine and the press never fires.
    it('suppresses the press when disabled', async () => {
      let presses = 0;
      mount(ROOT_TAG, () => (
        <pressable
          testID={TARGET}
          disabled
          onPress={() => {
            presses++;
          }}
        />
      ));
      await flush();

      const handle = responderHandle();
      fire(handle, TOUCH_START);
      fire(handle, TOUCH_END);
      expect(presses).toBe(0);
    });

    // why: unrelated a11y props reach the native node untouched. The "an enabled Pressable must not
    // report itself disabled" half left with its disabled twin, to
    // `core/engine/cpp/tests/js/pressable-payload.itest.ts` — an absence assertion on a harness
    // that can no longer produce the key passes for the wrong reason forever.
    it('passes a11y props through untouched', async () => {
      mount(ROOT_TAG, () => (
        <pressable
          testID={TARGET}
          accessibilityLabel="save"
          aria-hidden={false}
        />
      ));
      await flush();

      expect(committedTargetProps().accessibilityLabel).toBe('save');
    });

    // why: RN's long-press is exclusive with a tap — a held press must fire onLongPress and must
    // NOT also count as a completed onPress on release, but the machine must rearm so a later,
    // separate quick tap still works (a stuck "already long-pressed" flag would be a bug).
    it('fires onLongPress once on a hold, suppresses the tap, and rearms for the next tap', async () => {
      let longPresses = 0;
      let presses = 0;
      mount(ROOT_TAG, () => (
        <pressable
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
        <pressable
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
        <pressable
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
      expect(pressOuts).toBe(0);
      vi.advanceTimersByTime(DEFAULT_MIN_PRESS_DURATION_MS);
      expect(pressOuts).toBe(1);

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

    // why: pressRetentionOffset can be set per-edge, so the drift test must run against the real
    // measured frame rather than a symmetric approximation. This is also the only test that proves
    // IPressHost.getMeasureFn is wired to a LIVE host ref: with a broken ref the machine silently
    // falls back to the radius test and (a) below would drop the press instead of retaining it.
    it('tests the measured rect per-edge (asymmetric) for retention', async () => {
      measuredFrame = { width: 100, height: 40, pageX: 0, pageY: 0 };
      let presses = 0;
      let pressOuts = 0;
      mount(ROOT_TAG, () => (
        <pressable
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

    // why: unstable_pressDelay exists so a fast swipe-through does not flash every Pressable it
    // crosses as "pressed" — pressIn must wait for the delay, but a release before the delay
    // elapses must still FLUSH the deferred press rather than silently dropping the tap. Also
    // proves IPressHost.schedule is wired: without it the machine would never activate at all.
    it('defers the pressed state with unstable_pressDelay and flushes an early release', async () => {
      let pressIns = 0;
      let presses = 0;
      mount(ROOT_TAG, () => (
        <pressable
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

    it('cancels a pending unstable_pressDelay timer on unmount', async () => {
      let pressIns = 0;
      mount(ROOT_TAG, () => (
        <pressable
          testID={TARGET}
          unstable_pressDelay={PRESS_DELAY_MS}
          onPressIn={() => {
            pressIns++;
          }}
        />
      ));
      await flush();

      const handle = responderHandle();
      fire(handle, TOUCH_START);
      unmount(ROOT_TAG);
      vi.advanceTimersByTime(PRESS_DELAY_MS);
      expect(pressIns).toBe(0);
      // The adapter is already disposed; clear the test harness's process-global responder only
      // after the assertion, so cancellation cannot make the timer test falsely green.
      fire(handle, 'topTouchCancel');
    });

    // why: onPressMove is a distinct RN callback from the retention drift bookkeeping — it must
    // fire on every responder move while the press is live, independent of whether the move stays
    // inside or outside the retention region.
    it('fires onPressMove on every responder move while the press is live', async () => {
      let moves = 0;
      mount(ROOT_TAG, () => (
        <pressable
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
        <pressable testID={TARGET} cancelable={false} onPress={() => {}} />
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
        <pressable testID={TARGET} cancelable onPress={() => {}} />
      ));
      await flush();
      const gate = terminationGate(responderHandle());
      expect(gate, 'termination gate registered').toBeDefined();
      expect(gate?.({ nativeEvent: {} })).toBe(true);
    });

    // why: leaving `cancelable` unset must leave RN's own native default in charge — FORCING an
    // answer would override that default with our own opinion.
    //
    // Asserted on the ANSWER, not on the listener's presence: the behavior installs ONE dispatcher
    // per owned event at attach (it has to, since the machine needs the slot before any gesture
    // can start), and that dispatcher returns `undefined` when no inner gate was built — exactly
    // what an absent listener yields to the engine (`.claude/rules/adapter-parity-audit.md`,
    // "phrase a parity oracle as a CAPABILITY").
    it('forces no termination answer when cancelable is unset (RN implicit yes)', async () => {
      mount(ROOT_TAG, () => <pressable testID={TARGET} onPress={() => {}} />);
      await flush();
      const gate = terminationGate(responderHandle());
      expect(gate?.({ nativeEvent: {} })).toBeUndefined();
    });

    // why: android_ripple is gated on Platform.OS === 'android' and must be inert elsewhere (RN
    // Pressable.js). The fold itself is the engine behavior's (`core/components/src/behaviors/
    // pressable.ts`, asserted in `ripple-android.test.ts`); this pins that a bare tag
    // never wraps its child regardless — headless vitest resolves Platform.OS to 'ios'.
    it('never wraps the child in a ripple View, even on this iOS-resolved host', async () => {
      mount(ROOT_TAG, () => (
        <pressable
          testID={TARGET}
          android_ripple={{ color: '#f00' }}
          onPress={() => {}}
        >
          <view testID="ripple-child" />
        </pressable>
      ));
      await flush();

      const rippleCarrier = fabric.find(
        n =>
          n.props.nativeBackgroundAndroid !== undefined ||
          n.props.nativeForegroundAndroid !== undefined,
      );
      expect(rippleCarrier).toBeUndefined();
      const child = findCommitted(n => n.payload.testID === 'ripple-child');
      expect(child, 'the child mounts unwrapped').toBeDefined();
      expect(
        findCommitted(n => n.payload.testID === TARGET)?.children,
      ).toHaveLength(1);
    });

    // why: android_disableSound is a real native prop, not a JS concern — it has to reach Fabric
    // under RN's own key, and must be absent (never `false`) when the caller did not set it, or
    // Android would read an opinion the app never expressed.
    it('forwards android_disableSound under RN’s own key, and omits it when unset', async () => {
      mount(ROOT_TAG, () => (
        <pressable testID={TARGET} android_disableSound onPress={() => {}} />
      ));
      await flush();
      expect(committedTargetProps().android_disableSound).toBe(true);

      unmount(ROOT_TAG);
      fabric.reset();
      mount(ROOT_TAG, () => <pressable testID={TARGET} onPress={() => {}} />);
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
        <pressable
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
      // LISTENERS ONLY. The timing and config props beside them — `delayLongPress`,
      // `unstable_pressDelay`, `pressRetentionOffset`, `delayHoverIn`, `android_ripple` — are
      // stripped by the engine now (`foldPressableProps`) and are asserted in
      // `core/engine/cpp/tests/js/pressable-payload.itest.ts`. These three are a different
      // mechanism that is still entirely JS: `ownedListeners` diverts them into the behavior's
      // stash at `routeProp`, so they never become props at all.
      for (const key of ['onLongPress', 'onPressMove', 'onHoverIn']) {
        expect(key in props, `${key} must not reach Fabric`).toBe(false);
      }
      // hitSlop is the deliberate exception: the machine reads it AND native needs it to enlarge
      // the touch target, so it is the one config prop that DOES forward.
      expect(props.hitSlop).toBe(8);
    });
  });

  describe('Positive — the Solid lifecycle itself', () => {
    // why: `disabled` is a reactive per-prop write on a bare tag, not a memo rebuilding a whole
    // bag — a later flip must still reach the engine node's `disabled` read, which the press
    // machine consults fresh on every grant.
    it('drops the responder listeners when disabled flips after mount', async () => {
      const [disabled, setDisabled] = createSignal(false);
      let presses = 0;
      mount(ROOT_TAG, () => (
        <pressable
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

      fire(handle, TOUCH_START);
      fire(handle, TOUCH_END);
      expect(presses, 'a disabled Pressable stops responding').toBe(1);
    });

    // why: a bare tag has no body to re-run — its children are an ordinary Solid subtree, not a
    // render prop. A press must not disturb it: the responder listeners live on the tag's own
    // props, entirely separate from whatever the app put inside it.
    it('does not re-create a static child subtree on a press', async () => {
      mount(ROOT_TAG, () => (
        <pressable testID={TARGET} onPress={() => {}}>
          <view testID="static-child" />
        </pressable>
      ));
      await flush();
      const childAtMount = findCommitted(
        n => n.payload.testID === 'static-child',
      )?.handle;

      const handle = responderHandle();
      fire(handle, TOUCH_START);
      await flush();
      fire(handle, TOUCH_END);
      await flush();

      expect(
        findCommitted(n => n.payload.testID === 'static-child')?.handle,
        'the child kept its identity',
      ).toBe(childAtMount);
    });

    // why: `style` as a function of press state is the other half of the same contract, and it
    // must reach the SAME native node rather than a replacement — the style flows through View's
    // prop bag, so a press updates props on the live element instead of remounting it.
    it('re-resolves a function style against the live pressed state on the same node', async () => {
      mount(ROOT_TAG, () => (
        <pressable
          testID={TARGET}
          onPress={() => {}}
          style={state => ({ opacity: state.pressed ? 0.5 : 1 })}
        />
      ));
      await flush();
      const nodeAtMount = findCommitted(
        n => n.payload.testID === TARGET,
      )?.handle;
      expect(committedTargetProps().opacity).toBe(1);

      const handle = responderHandle();
      fire(handle, TOUCH_START);
      await flush();
      expect(committedTargetProps().opacity).toBe(0.5);
      expect(
        findCommitted(n => n.payload.testID === TARGET)?.handle,
        'the responder kept its identity',
      ).toBe(nodeAtMount);

      fire(handle, TOUCH_END);
      vi.advanceTimersByTime(DEFAULT_MIN_PRESS_DURATION_MS);
      await flush();
      expect(committedTargetProps().opacity).toBe(1);
    });
  });
});
