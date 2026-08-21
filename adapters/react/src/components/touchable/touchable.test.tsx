// Co-located React-driven pipeline test, ported from the headless
// `touchable.smoke`. Proves TouchableOpacity drives press feedback through the Animated
// engine (not a static style toggle): pressing in runs Animated.timing toward
// activeOpacity, pressing out animates back to the style's own resting opacity. The frames
// flow through the Animated.View leaf into the engine's scoped commit and land on the
// committed view's opacity, while the base style survives the per-frame diff. delayPressIn
// defers onPressIn past touch-down. No simulator: a failure here is in JS.
//
// rAF is polyfilled (setTimeout-based) and the clone is made to MERGE the diff onto
// existing props (real Fabric C++ behavior; the shared recorder replaces) so the base
// width survives the opacity-only per-frame diff, installed before any mount because the
// engine destructures slot methods off the global on its first commit.
//
// SCOPE: the shared press-timing/scheduling machine (computePressOutWait,
// createTouchableFeedbackRuntime/Handlers, the underlay machine) is fully unit-tested in
// core/components/src/state/touchable.test.ts — that ownership is N/A here (covered elsewhere).
// This file proves the React-side WIRING: that each Touchable* variant actually drives its real
// visual mechanism (Animated for Opacity, the underlay machine's container/child style split for
// Highlight, nothing for WithoutFeedback) through the real engine commit path. No Negative group:
// none of the three components has a throwing path — a bad prop just produces different visuals,
// not a rejection.

import { useState, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  View,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
} from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 120;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const ACTIVE_OPACITY = 0.3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
function mergeProps(
  previous: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...previous, ...patch };
  for (const key of Object.keys(patch)) {
    if (patch[key] === null) delete merged[key];
  }
  return merged;
}

const fabric = installFabric();
const installed: unknown = globalThis.nativeFabricUIManager;
if (!isRecord(installed)) throw new Error('fabric slot was not installed');

installed.cloneNodeWithNewProps = (
  node: IFakeNode,
  patch: Record<string, unknown>,
): IFakeNode => ({
  ...node,
  props: mergeProps(node.props, patch),
});
installed.cloneNodeWithNewChildrenAndProps = (
  node: IFakeNode,
  patch: Record<string, unknown>,
): IFakeNode => ({
  ...node,
  props: mergeProps(node.props, patch),
  children: [],
});
// Pressable measures its responder rect on grant (retention region); report a fixed frame.
installed.measure = (
  _node: IFakeNode,
  cb: (
    x: number,
    y: number,
    w: number,
    h: number,
    px: number,
    py: number,
  ) => void,
): void => cb(0, 0, 100, 40, 0, 0);

// rAF polyfill: the drivers read requestAnimationFrame from the host at call time; a
// setTimeout-based clock advancing 16ms per frame lets .start() run to completion.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const cb = pendingFrames.get(id);
        if (cb !== undefined) {
          pendingFrames.delete(id);
          frameClock += 16;
          cb(frameClock);
        }
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

// React flushes passive effects on its OWN scheduler, so an effect-driven animation does not
// start on the tick of the state update that triggered it — one macrotask later `pendingFrames`
// is still empty and flushFrames returns without waiting for anything. Alternating macrotasks
// with frame drains, a fixed number of rounds, lets the fade both start and finish. Fixed rounds
// rather than polling for the expected value on purpose: a loop that exits the moment the
// assertion would pass is the assertion in disguise.
async function flushEffectsAndFrames(): Promise<void> {
  for (let round = 0; round < 10; round++) {
    await new Promise(resolve => setTimeout(resolve, 5));
    await flushFrames();
  }
}

async function flushFrames(): Promise<void> {
  let guard = 0;
  while (pendingFrames.size > 0 && guard < 1_000) {
    guard++;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

// The responder is the Pressable's own RCTView, the first non-box-none RCTView created.
function responderHandle(): unknown {
  const view = fabric.find(
    n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
  );
  if (!view) throw new Error('no RCTView (Pressable responder) was created');
  return view.instanceHandle;
}

// The Animated.View carrying the opacity feedback is the DEEPEST committed non-box-none
// RCTView (the inner Animated.View, child of the Pressable's responder View).
function feedbackProps(): Record<string, unknown> {
  let found: Record<string, unknown> | undefined;
  function walk(node: IFakeNode): void {
    if (
      node.viewName === 'RCTView' &&
      node.props.pointerEvents !== 'box-none'
    ) {
      found = node.props;
    }
    for (const child of node.children) walk(child);
  }
  for (const root of fabric.committed) walk(root);
  if (found === undefined) throw new Error('no committed RCTView found');
  return found;
}

// TouchableHighlight splits its feedback across TWO nodes (RN's _createExtraStyles): the
// underlay color on the container — the Pressable's responder RCTView, shallowest — and the
// lowered opacity on the child, deepest. Asserting them apart is the point.
function committedViews(): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  function walk(node: IFakeNode): void {
    if (node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none')
      found.push(node.props);
    for (const child of node.children) walk(child);
  }
  for (const root of fabric.committed) walk(root);
  if (found.length < 2)
    throw new Error(
      `expected a container + a child RCTView, got ${found.length}`,
    );
  return found;
}

function containerProps(): Record<string, unknown> {
  return committedViews()[0];
}
function childProps(): Record<string, unknown> {
  const views = committedViews();
  return views[views.length - 1];
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number')
    throw new Error(
      `${label} should be a number, got ${JSON.stringify(value)}`,
    );
  return value;
}

describe('React TouchableOpacity animated feedback', () => {
  // why: RN picks the press-in duration from WHERE the press-in came from
  // (TouchableOpacity.js:215-220) — 0 when it rides the responder grant, 150 on a drift-back-in
  // re-activation. An ordinary tap is the grant branch, so RN snaps INSTANTLY; our engine
  // dispatches pressIn from topTouchStart only (events/index.ts:391) and has no re-activation
  // path, so 0 is the branch that applies. All five adapters used 150 until 2026-08-19.
  //
  // This test deliberately does NOT await a frame flush. Every other fade assertion here sits
  // behind `await flushFrames()`, which burns past 150 ms, so the duration is invisible to them —
  // swapping 0 for 150 left all 79 adapter tests green (.claude/rules/test-harness-false-greens
  // §5: the test that pins a duration is the one that does not wait).
  it('snaps to activeOpacity on press-in with no fade, as the grant branch does', () => {
    function App(): ReactElement {
      return (
        <TouchableOpacity
          activeOpacity={ACTIVE_OPACITY}
          style={{ width: 10 }}
        />
      );
    }
    mount(ROOT_TAG, <App />);

    expect(asNumber(feedbackProps().opacity, 'resting opacity')).toBe(1);

    fabric.fireEvent(responderHandle(), TOUCH_START);

    // Broken (duration 150): still ~1 here, the fade has not started moving.
    expect(
      asNumber(feedbackProps().opacity, 'opacity right after press-in'),
    ).toBeCloseTo(ACTIVE_OPACITY, 6);
  });

  // why: RN drives TouchableOpacity's feedback with a real Animated.timing (not a discrete style
  // swap), so it fades — a static opacity flip would be a regression to a cheaper, wrong
  // implementation. This proves the fade actually runs and lands on the committed native node.
  it('animates opacity to activeOpacity on press-in and back to 1 on press-out', async () => {
    let pressIns = 0;
    let pressOuts = 0;
    let presses = 0;

    function App(): ReactElement {
      return (
        <TouchableOpacity
          activeOpacity={ACTIVE_OPACITY}
          style={{ width: 10 }}
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
      );
    }
    mount(ROOT_TAG, <App />);

    const handle = responderHandle();

    // At rest opacity sits at 1 and keeps base style.
    const rest = feedbackProps();
    expect(asNumber(rest.opacity, 'resting opacity')).toBe(1);
    expect(rest.width).toBe(10);

    // Press in: the timing animation runs toward activeOpacity.
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    const active = feedbackProps();
    const activeOpacity = asNumber(active.opacity, 'pressed opacity');
    expect(activeOpacity).toBeLessThan(1);
    expect(activeOpacity).toBeCloseTo(ACTIVE_OPACITY, 6);
    expect(active.width).toBe(10);

    // Press out: the timing animation runs back to 1.
    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'released opacity')).toBeCloseTo(
      1,
      6,
    );

    // A full start+end synthesizes onPress; pressIn/pressOut each fired once.
    expect(presses).toBe(1);
    expect(pressIns).toBe(1);
    expect(pressOuts).toBe(1);
  });

  // why: delayPressIn lets a component defer its "pressed" feedback past a quick swipe-through,
  // exactly like Pressable's unstable_pressDelay — this proves the adapter actually threads the
  // prop into the shared scheduling machine rather than ignoring it (the machine's own timing
  // math is unit-tested at core; this is the wiring proof).
  it('defers onPressIn past touch-down with delayPressIn', async () => {
    const DELAY = 30;
    let deferredPressIns = 0;

    function App(): ReactElement {
      return (
        <TouchableOpacity
          delayPressIn={DELAY}
          onPressIn={() => {
            deferredPressIns++;
          }}
          onPress={() => {}}
        />
      );
    }
    mount(ROOT_TAG, <App />);

    fabric.fireEvent(responderHandle(), TOUCH_START);
    expect(deferredPressIns).toBe(0);
    await new Promise(resolve => setTimeout(resolve, DELAY + 20));
    expect(deferredPressIns).toBe(1);
  });

  // why: RN's Touchable* family OVERRIDES Pressability's own 130ms minPressDuration floor with 0
  // (TouchableOpacity.js:195) — what holds the active visual there is the fade's own duration, not
  // a press-duration floor. Adapters that defaulted to 130 delayed EVERY release by an eighth of a
  // second RN does not, and nothing caught it: the fade assertions all run behind `await
  // flushFrames()`, which burns enough real time for the floor to have expired. So this fires
  // press-in and press-out back to back with no await between them, where a floor is the whole
  // difference between a synchronous release and a deferred one.
  it('releases with no press-duration floor', () => {
    let pressOuts = 0;
    mount(
      ROOT_TAG,
      <TouchableOpacity
        onPress={() => {}}
        onPressOut={() => {
          pressOuts++;
        }}
      />,
    );
    const handle = responderHandle();

    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(
      pressOuts,
      'the release must not sit behind a minPressDuration floor',
    ).toBe(1);
  });

  // why: RN's _getChildStyleOpacityWithDefault settles the fade at the opacity the CALLER's style
  // asks for, not at a hard 1 — and seeds the Animated.Value there, or the very first paint jumps
  // a translucent Touchable to fully opaque. A hard-coded resting 1 (the pre-audit form) breaks
  // both ends of this.
  it('rests at the style opacity, not a hard 1, and returns to it after release', async () => {
    const STYLE_OPACITY = 0.6;
    mount(
      ROOT_TAG,
      <TouchableOpacity
        style={{ opacity: STYLE_OPACITY, width: 10 }}
        activeOpacity={ACTIVE_OPACITY}
        onPress={() => {}}
      />,
    );
    const handle = responderHandle();

    expect(asNumber(feedbackProps().opacity, 'resting opacity')).toBe(
      STYLE_OPACITY,
    );

    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'pressed opacity')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'released opacity')).toBeCloseTo(
      STYLE_OPACITY,
      6,
    );
  });

  // why: RN's componentDidUpdate re-settles the fade whenever `disabled` or the style opacity
  // changes, so a Touchable disabled mid-press does not stay stuck at its active opacity. Without
  // it a disabled button keeps the pressed look forever.
  it('re-settles the opacity when disabled flips mid-press', async () => {
    let setDisabled: ((disabled: boolean) => void) | undefined;

    function App(): ReactElement {
      const [disabled, update] = useState(false);
      setDisabled = update;
      return (
        <TouchableOpacity
          disabled={disabled}
          activeOpacity={ACTIVE_OPACITY}
          onPress={() => {}}
        />
      );
    }
    mount(ROOT_TAG, <App />);

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'pressed opacity')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    setDisabled?.(true);
    await flushEffectsAndFrames();
    expect(
      asNumber(feedbackProps().opacity, 'opacity after disabling'),
      'disabling mid-press must animate back to rest',
    ).toBeCloseTo(1, 6);
  });
});

describe('React TouchableHighlight underlay feedback', () => {
  // why: RN paints TouchableHighlight's feedback with a synchronous style swap (not Animated),
  // unlike TouchableOpacity above — and it SPLITS that swap across two nodes: the underlay color
  // on the container, the lowered opacity cloned onto the child (TouchableHighlight.js
  // _createExtraStyles + render). Folding both onto the container — what every adapter did before
  // the 2026-08-19 audit — fades the very underlay it is meant to reveal, so `underlayColor:
  // 'black'` paints grey. React is the only adapter that can reach the child (cloneElement), so
  // this test is the split's only guard in the repo.
  it('paints underlayColor on the container and activeOpacity on the child while pressed', () => {
    mount(
      ROOT_TAG,
      <TouchableHighlight
        underlayColor="#abc"
        activeOpacity={0.5}
        style={{ width: 10 }}
        onPress={() => {}}
      >
        <View style={{ height: 4 }} />
      </TouchableHighlight>,
    );
    const handle = responderHandle();

    expect(containerProps().backgroundColor).toBeUndefined();
    expect(containerProps().width).toBe(10);
    expect(childProps().opacity).toBeUndefined();

    fabric.fireEvent(handle, TOUCH_START);
    expect(containerProps().backgroundColor).toBe('#abc');
    expect(containerProps().width).toBe(10);
    // The container must stay OPAQUE — an opacity here would fade the underlay itself.
    expect(containerProps().opacity).toBeUndefined();
    expect(childProps().opacity).toBe(0.5);
    expect(childProps().height).toBe(4);
  });

  // why: the underlay hide is a TIMER, not a synchronous consequence of release. Our engine emits
  // press before pressOut, so onPress arms a delayPressOut hold and onPressOut sees it armed and
  // declines to hide — that is what makes a tap too fast to see still flash the underlay. A
  // synchronous clear on release would be the pre-audit behavior.
  it('holds the underlay past release for delayPressOut, then clears both halves', async () => {
    mount(
      ROOT_TAG,
      <TouchableHighlight
        underlayColor="#abc"
        activeOpacity={0.5}
        delayPressOut={40}
        onPress={() => {}}
      >
        <View style={{ height: 4 }} />
      </TouchableHighlight>,
    );
    const handle = responderHandle();

    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(
      containerProps().backgroundColor,
      'release must not clear the underlay synchronously',
    ).toBe('#abc');
    expect(childProps().opacity).toBe(0.5);

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(containerProps().backgroundColor).toBeUndefined();
    expect(childProps().opacity).toBeUndefined();
  });

  // why: RN's _hasPressHandler gates the whole underlay — a decorative TouchableHighlight with no
  // press callback must not flash on a touch that merely passes through it.
  it('paints no underlay when no press handler is supplied', async () => {
    mount(
      ROOT_TAG,
      <TouchableHighlight underlayColor="#abc" activeOpacity={0.5}>
        <View style={{ height: 4 }} />
      </TouchableHighlight>,
    );
    const handle = responderHandle();

    fabric.fireEvent(handle, TOUCH_START);
    expect(containerProps().backgroundColor).toBeUndefined();
    expect(childProps().opacity).toBeUndefined();

    fabric.fireEvent(handle, TOUCH_END);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(containerProps().backgroundColor).toBeUndefined();
  });

  // why: RN exposes the underlay transitions as props so a caller can drive sibling visuals off
  // them; no adapter forwarded them before phase two, and a forwarded-but-never-called prop is
  // indistinguishable from an absent one without this.
  it('fires onShowUnderlay and onHideUnderlay on the real transitions', async () => {
    const shows: number[] = [];
    const hides: number[] = [];
    mount(
      ROOT_TAG,
      <TouchableHighlight
        underlayColor="#abc"
        onPress={() => {}}
        onShowUnderlay={() => shows.push(1)}
        onHideUnderlay={() => hides.push(1)}
      >
        <View style={{ height: 4 }} />
      </TouchableHighlight>,
    );
    const handle = responderHandle();

    fabric.fireEvent(handle, TOUCH_START);
    expect(shows.length).toBeGreaterThan(0);
    expect(hides.length).toBe(0);

    fabric.fireEvent(handle, TOUCH_END);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(hides.length).toBe(1);
  });

  // why: the underlay handlers WRAP the caller's callbacks (visual first, then the caller's, RN's
  // order in _createPressabilityConfig). Wrapping is where a forwarded callback gets silently
  // dropped, so each one is asserted to still arrive.
  it('still delivers the caller onPress / onPressIn / onPressOut it intercepts', async () => {
    const calls: string[] = [];
    mount(
      ROOT_TAG,
      <TouchableHighlight
        underlayColor="#abc"
        onPress={() => calls.push('press')}
        onPressIn={() => calls.push('pressIn')}
        onPressOut={() => calls.push('pressOut')}
      >
        <View style={{ height: 4 }} />
      </TouchableHighlight>,
    );
    fabric.fireEvent(responderHandle(), TOUCH_START);
    fabric.fireEvent(responderHandle(), TOUCH_END);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(calls).toEqual(['pressIn', 'press', 'pressOut']);
  });
});

describe('React TouchableWithoutFeedback', () => {
  // why: RN's TouchableWithoutFeedback is a pure press-wiring passthrough with NO visual
  // reaction at all — proves it still synthesizes onPress (it is not merely an inert View) while
  // deliberately never touching backgroundColor/opacity the way its Highlight/Opacity siblings do.
  it('fires onPress with no visual feedback applied', () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      <TouchableWithoutFeedback
        style={{ width: 10 }}
        onPress={() => {
          presses++;
        }}
      >
        <></>
      </TouchableWithoutFeedback>,
    );
    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    const pressed = feedbackProps();
    expect(pressed.backgroundColor).toBeUndefined();
    expect(pressed.opacity).toBeUndefined();
    fabric.fireEvent(handle, TOUCH_END);
    expect(presses).toBe(1);
  });

  // why: RN's TouchableWithoutFeedback builds a FULL Pressability config — delayPressIn /
  // delayPressOut / minPressDuration — because "without feedback" means no VISUAL, not no timing.
  // Before phase two the adapter spread those props straight onto Pressable, which does not read
  // them, so every one was silently inert (and leaked to the host as unknown props).
  it('honors delayPressIn through the shared press machine', async () => {
    const DELAY = 30;
    let deferredPressIns = 0;

    mount(
      ROOT_TAG,
      <TouchableWithoutFeedback
        delayPressIn={DELAY}
        onPressIn={() => {
          deferredPressIns++;
        }}
        onPress={() => {}}
      >
        <></>
      </TouchableWithoutFeedback>,
    );

    fabric.fireEvent(responderHandle(), TOUCH_START);
    expect(deferredPressIns).toBe(0);
    await new Promise(resolve => setTimeout(resolve, DELAY + 20));
    expect(deferredPressIns).toBe(1);
  });
});
