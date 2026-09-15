// `touchable-opacity` and `touchable-highlight` as TAGS, through Solid's own renderer — the suite
// that was `components/touchable/touchable.test.tsx` while a wrapper composed Pressable. RN builds
// ONE `Animated.View` for TouchableOpacity (TouchableOpacity.js:302) and one View with a cloned
// extra style for TouchableHighlight, so the wrapper's second (faded-child) node was ours; both
// live on the engine node now (`core/components/src/behaviors/touchable-{opacity,highlight}.ts`).
//
// SCOPE: the shared press-timing/underlay machine (createTouchableFeedbackHandlers,
// createHighlightUnderlayHandlers) is fully unit-tested in core/components/src/state/touchable.test.ts
// and the two behavior files' own tests — that ownership is N/A here. This file proves the SOLID
// WIRING: compiled JSX reaches the tag, the fade/underlay lands on the COMMITTED node, and a prop
// read after mount still reaches the host (Solid runs a component body ONCE elsewhere, but these
// are bare tags with no body to freeze).
//
// No Negative group: neither tag has a throwing path.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
// SIDE-EFFECT IMPORT: registerTouchableOpacityBehavior / registerTouchableHighlightBehavior build
// the fade/underlay machines these tags run on.
import './register';
import { mount, unmount } from './render';

const ROOT_TAG = 851;
const TARGET = 'touchable-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const ACTIVE_OPACITY = 0.3;
const UNDERLAY = '#101010';

const fabric = installFabric();

// The commit is a microtask, so a case that never runs the fake clock still needs one drain. Real
// timers are faked for the whole suite (below), so this must not be a `setTimeout` tick.
const tick = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

// TouchableOpacity's fade rides a real Animated.timing, and the engine's JS driver reads
// requestAnimationFrame off the host at call time — same shim as
// core/components/src/behaviors/touchable-opacity.test.ts, driven by vi's fake timers so a 250ms
// release fade settles without a real 250ms wait and without hand-counting frames.
let frameClock = 0;
let nextFrameId = 1;
const pendingFrames = new Map<number, (time: number) => void>();

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const frame = pendingFrames.get(id);
        if (frame === undefined) return;
        pendingFrames.delete(id);
        frameClock += 16;
        frame(frameClock);
      }, 16);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

// Drains every timer a fade or a delayed underlay hide could have armed — 400ms comfortably clears
// the 250ms release fade, same budget core's own touchable-opacity suite uses.
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(400);
  await Promise.resolve();
}

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  nextFrameId = 1;
  pendingFrames.clear();
  installRequestAnimationFrame();
  vi.useFakeTimers();
});
afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function committed(predicate: (node: IFakeNode) => boolean): IFakeNode {
  let found: IFakeNode | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (found === undefined && predicate(node)) found = node;
      walk(node.children);
    }
  };
  walk(fabric.committed);
  if (found === undefined) throw new Error('no committed node matched');
  return found;
}

function target(): IFakeNode {
  return committed(node => node.props.testID === TARGET);
}

function createdTarget(): IFakeNode {
  const node = fabric.find(n => n.props.testID === TARGET);
  if (node === undefined) throw new Error(`no node created testID=${TARGET}`);
  return node;
}

describe('Solid: `touchable-opacity` and `touchable-highlight` as tags', () => {
  describe('TouchableOpacity', () => {
    // why: RN's grant branch snaps to activeOpacity with NO fade (OPACITY_ACTIVE_GRANT_DURATION_MS
    // is 0) — a wrong duration constant would still look right after enough frames, so this checks
    // BEFORE any frame runs.
    it('snaps to activeOpacity on press-in with no fade', async () => {
      mount(ROOT_TAG, () => (
        <touchable-opacity testID={TARGET} activeOpacity={ACTIVE_OPACITY}>
          <text>press me</text>
        </touchable-opacity>
      ));
      await tick();
      expect(target().props.opacity).toBe(1);

      fabric.fireEvent(createdTarget().instanceHandle, TOUCH_START);
      await tick();
      expect(target().props.opacity).toBe(ACTIVE_OPACITY);
    });

    // why: release fades back to the STYLE's own opacity (not a hard 1) over 250ms — proving the
    // committed node settles there, not merely that the animation started.
    it('fades back to the style opacity on press-out', async () => {
      mount(ROOT_TAG, () => (
        <touchable-opacity
          testID={TARGET}
          activeOpacity={ACTIVE_OPACITY}
          style={{ opacity: 0.8 }}
        >
          <text>press me</text>
        </touchable-opacity>
      ));
      await tick();

      const handle = createdTarget().instanceHandle;
      fabric.fireEvent(handle, TOUCH_START);
      await tick();
      fabric.fireEvent(handle, TOUCH_END);
      await settle();

      expect(target().props.opacity).toBe(0.8);
    });

    // why: onPress/onPressIn/onPressOut are the app's own callbacks — the fade must not swallow
    // them.
    it('still delivers onPress/onPressIn/onPressOut', async () => {
      let pressIns = 0;
      let presses = 0;
      let pressOuts = 0;
      mount(ROOT_TAG, () => (
        <touchable-opacity
          testID={TARGET}
          onPressIn={() => pressIns++}
          onPress={() => presses++}
          onPressOut={() => pressOuts++}
        />
      ));
      await tick();

      const handle = createdTarget().instanceHandle;
      fabric.fireEvent(handle, TOUCH_START);
      await tick();
      fabric.fireEvent(handle, TOUCH_END);
      await settle();

      expect(pressIns).toBe(1);
      expect(presses).toBe(1);
      expect(pressOuts).toBe(1);
    });

    // why: RN marks every Touchable accessible unless the app opts OUT — a missing default silently
    // drops a screen reader's ability to find the control.
    it('marks itself accessible by default', async () => {
      mount(ROOT_TAG, () => <touchable-opacity testID={TARGET} />);
      await tick();
      expect(target().props.accessible).toBe(true);
    });

    // why: Solid tags are reactive per-prop, unlike the old wrapper's memo — a later prop change
    // must still reach the SAME committed node rather than freezing at mount.
    it('re-commits the same node when activeOpacity changes after mount', async () => {
      const [active, setActive] = createSignal(0.2);
      mount(ROOT_TAG, () => (
        <touchable-opacity testID={TARGET} activeOpacity={active()} />
      ));
      await tick();
      const createdAtMount = fabric.counts.createNode;

      fabric.fireEvent(createdTarget().instanceHandle, TOUCH_START);
      await tick();
      expect(target().props.opacity).toBe(0.2);

      fabric.fireEvent(createdTarget().instanceHandle, TOUCH_END);
      await settle();
      setActive(0.6);
      await tick();

      fabric.fireEvent(createdTarget().instanceHandle, TOUCH_START);
      await tick();
      expect(target().props.opacity).toBe(0.6);
      expect(fabric.counts.createNode, 'the node kept its identity').toBe(
        createdAtMount,
      );
    });
  });

  describe('TouchableHighlight', () => {
    const HIGHLIGHT_CHILD = 'touchable-highlight-child';

    // why: RN splits the underlay backgroundColor and the pressed opacity across the container and
    // its cloned child (TouchableHighlight.js, confirmed against `TouchableHighlight-itest.js`'s
    // own two-node shape) — fixed at the engine level via `onChildInserted`
    // (core/components/src/behaviors/touchable-highlight.ts) 2026-09-15.
    it('paints underlayColor on the container and activeOpacity on the child, clears both on release', async () => {
      mount(ROOT_TAG, () => (
        <touchable-highlight
          testID={TARGET}
          underlayColor={UNDERLAY}
          activeOpacity={ACTIVE_OPACITY}
          onPress={() => {}}
        >
          <text testID={HIGHLIGHT_CHILD}>press me</text>
        </touchable-highlight>
      ));
      await tick();
      expect(target().props.backgroundColor).not.toBe(UNDERLAY);

      const handle = createdTarget().instanceHandle;
      fabric.fireEvent(handle, TOUCH_START);
      await tick();
      expect(target().props.backgroundColor).toBe(UNDERLAY);
      expect(target().props.opacity).toBeUndefined();
      expect(
        committed(node => node.props.testID === HIGHLIGHT_CHILD).props.opacity,
      ).toBe(ACTIVE_OPACITY);

      // The release re-shows before scheduling the hide, and the hide is a TIMER even at
      // delayPressOut: 0 (RN holds the underlay past a fast tap) — settle() drains it.
      fabric.fireEvent(handle, TOUCH_END);
      await settle();
      expect(target().props.backgroundColor).not.toBe(UNDERLAY);
      expect(
        committed(node => node.props.testID === HIGHLIGHT_CHILD).props.opacity,
      ).not.toBe(ACTIVE_OPACITY);
    });

    // why: `handlePressIn` shows on grant and `handlePress` re-affirms it before scheduling the
    // delayed hide (RN holds the underlay past a fast tap) — TWO shows per gesture is the real
    // machine's contract, pinned identically in
    // `core/components/src/behaviors/touchable-highlight.test.ts`. `onHideUnderlay` still fires
    // once, off the timer the press schedules.
    it('fires onShowUnderlay twice and onHideUnderlay once across a full gesture', async () => {
      let shows = 0;
      let hides = 0;
      mount(ROOT_TAG, () => (
        <touchable-highlight
          testID={TARGET}
          onPress={() => {}}
          onShowUnderlay={() => shows++}
          onHideUnderlay={() => hides++}
        />
      ));
      await tick();

      const handle = createdTarget().instanceHandle;
      fabric.fireEvent(handle, TOUCH_START);
      await tick();
      fabric.fireEvent(handle, TOUCH_END);
      await settle();

      expect(shows).toBe(2);
      expect(hides).toBe(1);
    });

    // why: without any press handler RN paints no underlay at all — a Highlight that only forwards
    // taps elsewhere must not flash a background nobody asked for.
    it('paints no underlay when no press handler is supplied', async () => {
      mount(ROOT_TAG, () => (
        <touchable-highlight testID={TARGET} underlayColor={UNDERLAY} />
      ));
      await tick();

      fabric.fireEvent(createdTarget().instanceHandle, TOUCH_START);
      await tick();
      expect(target().props.backgroundColor).not.toBe(UNDERLAY);
    });

    // why: RN marks every Touchable accessible unless the app opts OUT — Opacity already had this
    // case, Highlight did not (RN-parity sweep gap).
    it('marks itself accessible by default', async () => {
      mount(ROOT_TAG, () => <touchable-highlight testID={TARGET} />);
      await tick();
      expect(target().props.accessible).toBe(true);
    });
  });

  // why: neither variant had a `focusable` test at all before this sweep — RN gives Pressable a
  // ONE-leg default (Pressable.js:258) and the Touchables a THREE-leg one
  // (TouchableOpacity.js:336-340, TouchableHighlight.js:370-374), so each tag folds its own; a
  // missing test here would miss a regression to the plain Pressable default.
  describe('focusable', () => {
    it('TouchableOpacity stays out of the focus order without an onPress', async () => {
      mount(ROOT_TAG, () => <touchable-opacity testID={TARGET} />);
      await tick();
      expect(target().props.focusable).toBe(false);
    });

    it('TouchableOpacity focuses once it has an onPress', async () => {
      mount(ROOT_TAG, () => (
        <touchable-opacity testID={TARGET} onPress={() => {}} />
      ));
      await tick();
      expect(target().props.focusable).toBe(true);
    });

    // why: the case a `focusable ?? computed` implementation gets wrong — an explicit opt-IN
    // still loses to `disabled`.
    it('TouchableOpacity refuses focus while disabled, opt-in notwithstanding', async () => {
      mount(ROOT_TAG, () => (
        <touchable-opacity
          testID={TARGET}
          onPress={() => {}}
          disabled
          focusable
        />
      ));
      await tick();
      expect(target().props.focusable).toBe(false);
    });

    it('TouchableHighlight stays out of the focus order without an onPress', async () => {
      mount(ROOT_TAG, () => <touchable-highlight testID={TARGET} />);
      await tick();
      expect(target().props.focusable).toBe(false);
    });

    it('TouchableHighlight focuses once it has an onPress', async () => {
      mount(ROOT_TAG, () => (
        <touchable-highlight testID={TARGET} onPress={() => {}} />
      ));
      await tick();
      expect(target().props.focusable).toBe(true);
    });

    it('TouchableHighlight refuses focus while disabled, opt-in notwithstanding', async () => {
      mount(ROOT_TAG, () => (
        <touchable-highlight
          testID={TARGET}
          onPress={() => {}}
          disabled
          focusable
        />
      ));
      await tick();
      expect(target().props.focusable).toBe(false);
    });
  });

  // The universal gap: React/Vue/Svelte/Angular and Solid all had ZERO bridge tests for this
  // component before this sweep, despite core (`behaviors/touchable-without-feedback.ts`+test)
  // fully implementing the same accessible/focusable/accessibilityState fold as TouchableHighlight.
  // TWF renders NO view of its own — it clones props onto its single child, and `testID` is only
  // cloned WHEN SET on the owner, so it goes on the owner tag here, same as everywhere else.
  describe('TouchableWithoutFeedback', () => {
    it('fires onPress from a real touch', async () => {
      let presses = 0;
      mount(ROOT_TAG, () => (
        <touchable-without-feedback testID={TARGET} onPress={() => presses++}>
          <text>press me</text>
        </touchable-without-feedback>
      ));
      await tick();

      const handle = createdTarget().instanceHandle;
      fabric.fireEvent(handle, TOUCH_START);
      fabric.fireEvent(handle, TOUCH_END);
      await settle();

      expect(presses).toBe(1);
    });

    // why: lesson 6 — a disabled test that only checks style/accessibilityState doesn't prove
    // `onPress` is actually gated.
    it('suppresses onPress from a real touch while disabled', async () => {
      let presses = 0;
      mount(ROOT_TAG, () => (
        <touchable-without-feedback
          testID={TARGET}
          disabled
          onPress={() => presses++}
        >
          <text>press me</text>
        </touchable-without-feedback>
      ));
      await tick();

      const handle = createdTarget().instanceHandle;
      fabric.fireEvent(handle, TOUCH_START);
      fabric.fireEvent(handle, TOUCH_END);
      await settle();

      expect(presses).toBe(0);
    });

    it('computes focusable and accessibilityState from disabled', async () => {
      mount(ROOT_TAG, () => (
        <touchable-without-feedback testID={TARGET} disabled onPress={() => {}}>
          <text>press me</text>
        </touchable-without-feedback>
      ));
      await tick();

      expect(target().props.focusable).toBe(false);
      expect(target().props.accessibilityState).toMatchObject({
        disabled: true,
      });
    });
  });
});
