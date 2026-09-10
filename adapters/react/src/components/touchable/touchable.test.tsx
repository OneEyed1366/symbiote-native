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
import { mount, unmount, View } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 120;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const ACTIVE_OPACITY = 0.3;
// Long enough for the engine's own commit to publish a value that was SET, far short of the
// 150 ms fade the grant-branch case exists to rule out.
const DURATION_PROBE_MS = 20;

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

// The engine folds an underlay flip into the node's payload and asks for a commit; the commit is
// scheduled rather than run inside the event, so a read taken synchronously after a touch sees the
// pre-flip payload. Well under the 40 ms `delayPressOut` the hold case pins.
const settleUnderlay = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, DURATION_PROBE_MS));

// Both halves of a TouchableHighlight's feedback land on ONE node now (see the assertion below for
// why), but the helpers stay split: `containerProps` is the responder and `childProps` the app's
// own child, and proving the child is UNTOUCHED is what the second one is for.
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
  it('snaps to activeOpacity on press-in with no fade, as the grant branch does', async () => {
    function App(): ReactElement {
      return (
        <touchable-opacity
          activeOpacity={ACTIVE_OPACITY}
          style={{ width: 10 }}
        />
      );
    }
    mount(ROOT_TAG, <App />);
    // The RESTING value is published from the behavior's `afterCommit`, one commit after the
    // mount — the wrapper carried it in the style it rendered, so it was there synchronously. This
    // await is on the setup, NOT on the measurement: the press-in read below still takes no wait,
    // which is what keeps the 0-vs-150ms duration observable at all.
    await flushEffectsAndFrames();

    expect(asNumber(feedbackProps().opacity, 'resting opacity')).toBe(1);

    fabric.fireEvent(responderHandle(), TOUCH_START);
    // A BOUNDED wait, an order of magnitude under the 150 ms it is guarding against — the engine
    // publishes an animated value on its own commit rather than in the render that fired the
    // event, so a strictly synchronous read now sees nothing on ANY duration and the oracle would
    // be dead. Draining frames instead is not available here: `flushFrames` runs until nothing is
    // pending, which burns past 150 ms and is exactly what makes every other fade assertion in
    // this file blind to the duration (test-harness-false-greens §5).
    await new Promise(resolve => setTimeout(resolve, DURATION_PROBE_MS));

    // Broken (duration 150): ~0.97 here, barely started. Correct (0): already landed.
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
        <touchable-opacity
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
    // See the case above: the resting value lands one commit after the mount now.
    await flushEffectsAndFrames();

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
        <touchable-opacity
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
      <touchable-opacity
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
      <touchable-opacity
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
        <touchable-opacity
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
  it('paints underlayColor and activeOpacity while pressed, and clears the child', async () => {
    mount(
      ROOT_TAG,
      <touchable-highlight
        underlayColor="#abc"
        activeOpacity={0.5}
        style={{ width: 10 }}
        onPress={() => {}}
      >
        <View style={{ height: 4 }} />
      </touchable-highlight>,
    );
    const handle = responderHandle();

    expect(containerProps().backgroundColor).toBeUndefined();
    expect(containerProps().width).toBe(10);
    expect(childProps().opacity).toBeUndefined();

    fabric.fireEvent(handle, TOUCH_START);
    await settleUnderlay();
    expect(containerProps().backgroundColor).toBe('#abc');
    expect(containerProps().width).toBe(10);
    // BOTH halves land on the ONE node, and the child is untouched — this is the tag's documented
    // divergence from RN, which paints the underlay on a container and clones the lowered opacity
    // onto the child. Splitting them needs a child to target, and a tag has no render to reach one
    // (`core/components/src/behaviors/touchable-highlight.ts`, and `component-names/shared.ts` at
    // the tag's own declaration). Every adapter's wrapper except React's had already shipped this
    // simplification; deleting React's wrapper is what made it the only shape.
    expect(containerProps().opacity).toBe(0.5);
    expect(childProps().opacity).toBeUndefined();
    expect(childProps().height).toBe(4);
  });

  // why: the underlay hide is a TIMER, not a synchronous consequence of release. Our engine emits
  // press before pressOut, so onPress arms a delayPressOut hold and onPressOut sees it armed and
  // declines to hide — that is what makes a tap too fast to see still flash the underlay. A
  // synchronous clear on release would be the pre-audit behavior.
  it('holds the underlay past release for delayPressOut, then clears both halves', async () => {
    mount(
      ROOT_TAG,
      <touchable-highlight
        underlayColor="#abc"
        activeOpacity={0.5}
        delayPressOut={40}
        onPress={() => {}}
      >
        <View style={{ height: 4 }} />
      </touchable-highlight>,
    );
    const handle = responderHandle();

    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await settleUnderlay();
    expect(
      containerProps().backgroundColor,
      'release must not clear the underlay before delayPressOut elapses',
    ).toBe('#abc');
    expect(containerProps().opacity).toBe(0.5);

    await new Promise(resolve => setTimeout(resolve, 60));
    expect(containerProps().backgroundColor).toBeUndefined();
    expect(containerProps().opacity).toBeUndefined();
  });

  // why: RN's _hasPressHandler gates the whole underlay — a decorative TouchableHighlight with no
  // press callback must not flash on a touch that merely passes through it.
  it('paints no underlay when no press handler is supplied', async () => {
    mount(
      ROOT_TAG,
      <touchable-highlight underlayColor="#abc" activeOpacity={0.5}>
        <View style={{ height: 4 }} />
      </touchable-highlight>,
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
      <touchable-highlight
        underlayColor="#abc"
        onPress={() => {}}
        onShowUnderlay={() => shows.push(1)}
        onHideUnderlay={() => hides.push(1)}
      >
        <View style={{ height: 4 }} />
      </touchable-highlight>,
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
      <touchable-highlight
        underlayColor="#abc"
        onPress={() => calls.push('press')}
        onPressIn={() => calls.push('pressIn')}
        onPressOut={() => calls.push('pressOut')}
      >
        <View style={{ height: 4 }} />
      </touchable-highlight>,
    );
    fabric.fireEvent(responderHandle(), TOUCH_START);
    fabric.fireEvent(responderHandle(), TOUCH_END);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(calls).toEqual(['pressIn', 'press', 'pressOut']);
  });
});

// TouchableWithoutFeedback's own block left with the wrapper: it is a tag now, and both its press
// wiring and its delayPressIn scheduler are covered against the COMMITTED tree in
// `core/components/src/behaviors/touchable-without-feedback.test.ts`.

// RN sets `accessible={this.props.accessible !== false}` on each Touchable itself
// (TouchableOpacity.js:303, TouchableHighlight.js:337). Here the whole family composes over
// Pressable, which owns that fold — so this pins the COMPOSITION, not a second implementation:
// a variant that stopped forwarding `accessible` through its rest spread would go red here.
describe('React Touchable* accessibility default', () => {
  function responderProps(): Record<string, unknown> {
    const view = fabric.find(
      n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
    );
    if (!view) throw new Error('no RCTView (Pressable responder) was created');
    return view.props;
  }

  const variants: [string, (child: ReactElement) => ReactElement][] = [
    [
      'TouchableOpacity',
      c => <touchable-opacity onPress={() => {}}>{c}</touchable-opacity>,
    ],
    [
      'TouchableHighlight',
      c => <touchable-highlight onPress={() => {}}>{c}</touchable-highlight>,
    ],
  ];

  for (const [name, render] of variants) {
    it(`${name} marks its responder accessible by default`, () => {
      mount(ROOT_TAG, render(<View />));
      expect(responderProps().accessible).toBe(true);
    });
  }

  it('a literal false still opts out through the composition', () => {
    mount(
      ROOT_TAG,
      <touchable-opacity accessible={false} onPress={() => {}}>
        <View />
      </touchable-opacity>,
    );
    expect(responderProps().accessible).toBe(false);
  });
});

// `focusable` is the OTHER half of that fold and it does NOT compose the same way: RN gives
// Pressable a one-leg default (Pressable.js:258) and the Touchables a three-leg one
// (TouchableOpacity.js:336-340, TouchableHighlight.js:370-374,
// TouchableWithoutFeedback.js:263-266), so the wrapper has to resolve it and hand the answer down.
// Nothing computed it anywhere until 2026-09-09 — a disabled touchable stayed focusable, so a
// keyboard or TV remote could land on a control that cannot be pressed.
describe('React Touchable* focusable', () => {
  function responderProps(): Record<string, unknown> {
    const view = fabric.find(
      n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none',
    );
    if (!view) throw new Error('no RCTView (Pressable responder) was created');
    return view.props;
  }

  const variants: [string, (props: Record<string, unknown>) => ReactElement][] =
    [
      [
        'TouchableOpacity',
        p => (
          <touchable-opacity {...p}>
            <View />
          </touchable-opacity>
        ),
      ],
      [
        'TouchableHighlight',
        p => (
          <touchable-highlight {...p}>
            <View />
          </touchable-highlight>
        ),
      ],
    ];

  for (const [name, render] of variants) {
    // Leg 2, read off the APP's onPress — the handler the wrapper hands Pressable is always
    // defined, so resolving one level down could never answer false.
    it(`${name} stays out of the focus order without an onPress`, () => {
      mount(ROOT_TAG, render({}));
      expect(responderProps().focusable).toBe(false);
    });

    it(`${name} focuses once it has an onPress`, () => {
      mount(ROOT_TAG, render({ onPress: () => {} }));
      expect(responderProps().focusable).toBe(true);
    });

    // Leg 3, and the case a `focusable ?? computed` implementation gets wrong: `&&` means an
    // explicit opt-IN still loses to `disabled`.
    it(`${name} refuses focus while disabled, opt-in notwithstanding`, () => {
      mount(
        ROOT_TAG,
        render({ onPress: () => {}, disabled: true, focusable: true }),
      );
      expect(responderProps().focusable).toBe(false);
    });
  }
});
