// Solid twin of adapters/react/src/components/touchable/touchable.test.tsx. Drives REAL compiled
// Solid JSX (the vitest `solid` project runs the same babel-preset-solid options the app-facing
// babel-preset.cjs pins) through the universal renderer into the fake Fabric slot, firing the raw
// touch primitives the way native would.
//
// SCOPE. The press-scheduling machine itself (computePressOutWait, createTouchableFeedback*) is
// unit-tested in core/components/src/state/touchable.test.ts, and the press lifecycle underneath in
// pressable.test.tsx. What is Solid-specific — and therefore what this file is for:
//   - each variant drives its REAL visual mechanism through a real engine commit (Animated for
//     Opacity, a style-function overlay for Highlight, nothing for WithoutFeedback);
//   - a press must not GROW the node count. Trap 4's real failure is a lost native responder grant,
//     which is unreachable headless — fabric.fireEvent hands the event straight to the node's
//     listener, so there is no grant to lose. Node churn is its one observable trace
//     (.claude/rules/solid-descriptor-bridge.md §4);
//   - a Solid body runs ONCE, so "a prop changed after mount still reaches the feedback" and
//     "unmount cancels an in-flight timer" are real, silently-breakable claims rather than
//     tautologies.
//
// rAF is polyfilled (setTimeout-based) and the clone is made to MERGE the diff onto existing props
// (real Fabric C++ behavior; the shared recorder replaces) so the base width survives the
// opacity-only per-frame diff. Both are installed before any mount, because the engine destructures
// slot methods off the global on its first commit.
//
// No Negative group: none of the three has a throwing path — a bad prop produces different visuals,
// never a rejection.

import { createSignal } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { clearGlobalStyles, registerRules } from '@symbiote-native/engine';
import { mount, unmount } from '../../render';
import {
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
} from './index';

const ROOT_TAG = 821;
const TARGET = 'touchable-target';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const ACTIVE_OPACITY = 0.3;
const BASE_WIDTH = 10;
const PRESS_DELAY_MS = 30;
const FEEDBACK_CLASS = 'touchable-feedback';
const FEEDBACK_FLEX = 1;
// The press-out is floored by minPressDuration; anything asserted after a release has to outlast it.
// Comfortably past any release hold; the exact figure is not under test.
const RELEASE_SETTLE_MS = 150;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Real Fabric merges a props diff onto the node's existing props; the shared recorder replaces
// them, which would drop `width` the moment an opacity-only frame lands.
function mergeNodeProps(
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
): IFakeNode => ({ ...node, props: mergeNodeProps(node.props, patch) });
installed.cloneNodeWithNewChildrenAndProps = (
  node: IFakeNode,
  patch: Record<string, unknown>,
): IFakeNode => ({
  ...node,
  props: mergeNodeProps(node.props, patch),
  children: [],
});
// Pressable measures its responder rect on grant (RN's _measureResponderRegion).
installed.measure = (
  _node: IFakeNode,
  callback: (
    x: number,
    y: number,
    w: number,
    h: number,
    px: number,
    py: number,
  ) => void,
): void => {
  callback(0, 0, 100, 40, 0, 0);
};

// The drivers read requestAnimationFrame off the host at call time; a setTimeout-based clock
// advancing 16ms per frame lets .start() run to completion without real animation time.
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
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

// The engine commits on a microtask (renderer.ts's requestCommit), so nothing reaches the fake slot
// until that queue drains.
const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

async function flushFrames(): Promise<void> {
  let guard = 0;
  while (pendingFrames.size > 0 && guard < 1_000) {
    guard++;
    await wait(0);
  }
  await flush();
}

// Press-out is deferred by the shared minPressDuration floor, so the release path needs real time
// before its frames can be drained.
async function settleRelease(): Promise<void> {
  await wait(RELEASE_SETTLE_MS);
  await flushFrames();
}

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  nextFrameId = 1;
  pendingFrames.clear();
  installRequestAnimationFrame();
  clearGlobalStyles();
  registerRules([
    {
      tokens: [FEEDBACK_CLASS],
      specificity: [0, 1, 0],
      order: 0,
      style: { flex: FEEDBACK_FLEX },
    },
  ]);
});
afterEach(() => {
  unmount(ROOT_TAG);
  clearGlobalStyles();
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

// The responder is the Pressable's own RCTView, found by the testID every mount below sets.
function responderHandle(): unknown {
  const node = fabric.find(n => n.props.testID === TARGET);
  if (node === undefined)
    throw new Error(`no node created with testID=${TARGET}`);
  return node.instanceHandle;
}

// The node carrying the feedback: the DEEPEST committed non-box-none RCTView. For
// TouchableOpacity that is the inner Animated.View; for the other two it is the responder itself,
// which is exactly where each paints. Read off the COMMITTED tree — fabric.find would hand back the
// mount-time snapshot and read as passing forever.
function feedbackProps(): Record<string, unknown> {
  let found: Record<string, unknown> | undefined;
  function walk(node: IFakeNode): void {
    if (node.viewName === 'RCTView' && node.props.pointerEvents !== 'box-none')
      found = node.props;
    for (const child of node.children) walk(child);
  }
  for (const root of fabric.committed) walk(root);
  if (found === undefined) throw new Error('no committed RCTView found');
  return found;
}

// Walks the committed tree for the first node matching a predicate; the structural claims below
// need the NODE (its children), not just its props.
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

// The responder's own committed props, read by testID — `feedbackProps` deliberately walks past it
// to the deepest view, so a claim ABOUT the responder needs its own lookup.
function committedResponderProps(): Record<string, unknown> {
  let found: Record<string, unknown> | undefined;
  function walk(node: IFakeNode): void {
    if (node.props.testID === TARGET) found = node.props;
    for (const child of node.children) walk(child);
  }
  for (const root of fabric.committed) walk(root);
  if (found === undefined)
    throw new Error(`no committed node with testID=${TARGET}`);
  return found;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number')
    throw new Error(
      `${label} should be a number, got ${JSON.stringify(value)}`,
    );
  return value;
}

// A child with its own host node, so the counters below would actually move if a press rebuilt the
// subtree instead of re-propping it.
function TouchableChild(): JSX.Element {
  return <symbiote-view testID="touchable-child" />;
}

describe('Solid TouchableOpacity', () => {
  // why: RN drives TouchableOpacity's feedback with a real Animated.timing, not a discrete style
  // swap. This proves the fade actually runs through the engine's Animated graph and lands on the
  // committed native node, and that the caller's base style survives the per-frame opacity diff.
  it('animates opacity to activeOpacity on press-in and back to 1 on press-out', async () => {
    let pressIns = 0;
    let pressOuts = 0;
    let presses = 0;

    mount(ROOT_TAG, () => (
      <TouchableOpacity
        testID={TARGET}
        activeOpacity={ACTIVE_OPACITY}
        style={{ width: BASE_WIDTH }}
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

    const rest = feedbackProps();
    expect(asNumber(rest.opacity, 'resting opacity')).toBe(1);
    expect(rest.width).toBe(BASE_WIDTH);

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    const active = feedbackProps();
    expect(asNumber(active.opacity, 'pressed opacity')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );
    expect(active.width, 'the base style survived the opacity diff').toBe(
      BASE_WIDTH,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await settleRelease();
    expect(asNumber(feedbackProps().opacity, 'released opacity')).toBeCloseTo(
      1,
      6,
    );

    expect(presses).toBe(1);
    expect(pressIns).toBe(1);
    expect(pressOuts).toBe(1);
  });

  // why: THE trap-4 assertion, and the only headless trace of the device failure it guards against
  // — a subtree rebuilt mid-gesture lands between pressIn and the native responder grant and kills
  // the gesture. The feedback is a prop-bag value, so a full press cycle must create NOTHING; the
  // counter is exactly the line between a re-prop and a re-render.
  it('creates no node across a full press cycle', async () => {
    mount(ROOT_TAG, () => (
      <TouchableOpacity testID={TARGET} activeOpacity={ACTIVE_OPACITY}>
        <TouchableChild />
      </TouchableOpacity>
    ));
    await flush();
    const createdAtMount = fabric.counts.createNode;

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(fabric.counts.createNode, 'press-in rebuilt a subtree').toBe(
      createdAtMount,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await settleRelease();
    expect(fabric.counts.createNode, 'release rebuilt a subtree').toBe(
      createdAtMount,
    );
  });

  // why: RN's Touchables pass minPressDuration: 0 — Pressability's own 130ms floor
  // (Pressability.js:264) never reaches them. Defaulting to 130, which every pre-audit adapter
  // does, delays EVERY press-out by an eighth of a second. Observable as ordering alone: with no
  // floor the deactivation is synchronous, so onPressOut has already fired when fireEvent returns.
  it('deactivates synchronously — no minPressDuration floor by default', async () => {
    let pressOuts = 0;
    mount(ROOT_TAG, () => (
      <TouchableOpacity
        testID={TARGET}
        onPressOut={() => {
          pressOuts++;
        }}
      />
    ));
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(pressOuts, 'a floor would have deferred this past the tick').toBe(1);
  });

  // why: RN's _getChildStyleOpacityWithDefault settles the fade at the opacity the CALLER's style
  // asks for, not at a hard 1 — and seeds the Animated.Value with it, so first paint is not a jump
  // to fully opaque. A port that hardcodes RESTING_OPACITY is visibly wrong on a faded Touchable.
  it('rests at the style opacity, not at 1', async () => {
    mount(ROOT_TAG, () => (
      <TouchableOpacity
        testID={TARGET}
        activeOpacity={ACTIVE_OPACITY}
        style={{ width: BASE_WIDTH, opacity: 0.6 }}
      />
    ));
    await flush();
    expect(asNumber(feedbackProps().opacity, 'initial')).toBeCloseTo(0.6, 6);

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'pressed')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await settleRelease();
    expect(asNumber(feedbackProps().opacity, 'released')).toBeCloseTo(0.6, 6);
  });

  // why: RN's componentDidUpdate re-settles the view when `disabled` flips, so a Touchable disabled
  // mid-press does not stay frozen at its active opacity. The effect must ALSO stay quiet at mount,
  // or it animates over the value the Animated.Value was just seeded with.
  it('re-settles the opacity when disabled flips after a press-in', async () => {
    const [disabled, setDisabled] = createSignal(false);
    mount(ROOT_TAG, () => (
      <TouchableOpacity
        testID={TARGET}
        activeOpacity={ACTIVE_OPACITY}
        disabled={disabled()}
      />
    ));
    await flush();
    expect(asNumber(feedbackProps().opacity, 'at mount')).toBeCloseTo(1, 6);

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'held')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    setDisabled(true);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'after disabling')).toBeCloseTo(
      1,
      6,
    );
  });

  // why: `style` and `class` describe the FEEDBACK node, and TouchableOpacity is the one variant
  // where that is not the node the responder lives on. Left in `rest` the class would resolve onto
  // the outer Pressable — visually plausible, wrong box — so both halves are asserted: it lands on
  // the Animated.View and it does NOT land on the responder.
  it('resolves `class` onto the feedback node, not the responder', async () => {
    mount(ROOT_TAG, () => (
      <TouchableOpacity testID={TARGET} class={FEEDBACK_CLASS} />
    ));
    await flush();

    expect(feedbackProps().flex, 'the feedback node').toBe(FEEDBACK_FLEX);
    expect(committedResponderProps().flex, 'the responder').toBeUndefined();
  });

  // why: delayPressIn defers the pressed feedback past a quick swipe-through. Proves the adapter
  // threads the prop into the shared machine rather than ignoring it (the machine's own timing math
  // is unit-tested at core; this is the wiring).
  it('defers onPressIn past touch-down with delayPressIn', async () => {
    let pressIns = 0;
    mount(ROOT_TAG, () => (
      <TouchableOpacity
        testID={TARGET}
        delayPressIn={PRESS_DELAY_MS}
        onPressIn={() => {
          pressIns++;
        }}
      />
    ));
    await flush();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    expect(pressIns, 'fired before the delay elapsed').toBe(0);
    await wait(PRESS_DELAY_MS + 20);
    expect(pressIns).toBe(1);
  });

  // why: a Solid component body runs ONCE. Destructuring `props` — the shape ported straight from
  // React — would freeze activeOpacity at its mount-time value, and every assertion above would
  // still pass. Only a value that CHANGES after mount can see it.
  it('honors an activeOpacity changed after mount', async () => {
    const [activeOpacity, setActiveOpacity] = createSignal(0.5);
    mount(ROOT_TAG, () => (
      <TouchableOpacity testID={TARGET} activeOpacity={activeOpacity()} />
    ));
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'first press')).toBeCloseTo(
      0.5,
      6,
    );
    fabric.fireEvent(handle, TOUCH_END);
    await settleRelease();

    setActiveOpacity(0.1);
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(
      asNumber(feedbackProps().opacity, 'press after the change'),
    ).toBeCloseTo(0.1, 6);
  });

  // why: the deferred activation is a real setTimeout the adapter owns. Without the onCleanup that
  // cancels it, unmounting mid-delay fires activate() into a disposed reactive scope — it would
  // drive an Animated.Value whose leaf is gone and call the caller back after teardown.
  it('cancels a pending delayPressIn timer on unmount', async () => {
    let pressIns = 0;
    mount(ROOT_TAG, () => (
      <TouchableOpacity
        testID={TARGET}
        delayPressIn={PRESS_DELAY_MS}
        onPressIn={() => {
          pressIns++;
        }}
      />
    ));
    await flush();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    unmount(ROOT_TAG);
    await wait(PRESS_DELAY_MS + 20);
    expect(pressIns, 'the timer outlived the component').toBe(0);
  });
});

describe('Solid TouchableHighlight', () => {
  // why: RN paints the highlight with a synchronous style overlay, not Animated — this proves the
  // adapter's pressedStyle function (through Pressable's style-as-function prop) composes
  // highlightPressedStyle's [style, overlay] tuple onto the real committed node while pressed, and
  // drops back to the bare style on release.
  it('paints underlayColor + activeOpacity while pressed, and clears on release', async () => {
    mount(ROOT_TAG, () => (
      <TouchableHighlight
        testID={TARGET}
        underlayColor="#abc"
        activeOpacity={0.5}
        style={{ width: BASE_WIDTH }}
        onPress={() => {}}
      />
    ));
    await flush();

    const rest = feedbackProps();
    expect(rest.backgroundColor).toBeUndefined();
    expect(rest.width).toBe(BASE_WIDTH);

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    const pressed = feedbackProps();
    expect(pressed.backgroundColor).toBe('#abc');
    expect(pressed.opacity).toBe(0.5);
    expect(pressed.width, 'the base style survived the overlay').toBe(
      BASE_WIDTH,
    );

    // The release is ASYNC now, and that is RN: onPress arms a hide timer at delayPressOut (0 here),
    // so the underlay outlives the microtask queue by one macrotask.
    fabric.fireEvent(handle, TOUCH_END);
    await wait(20);
    await flush();
    expect(feedbackProps().backgroundColor).toBeUndefined();
  });

  // why: the highlight is the variant most likely to be written as a conditional in the JSX (a
  // pressed branch wrapping the children). That shape rebuilds the subtree on every press, which is
  // the gesture-killing failure of trap 4; the counter is what forbids it.
  it('creates no node across a full press cycle', async () => {
    mount(ROOT_TAG, () => (
      <TouchableHighlight
        testID={TARGET}
        underlayColor="#abc"
        onPress={() => {}}
      >
        <TouchableChild />
      </TouchableHighlight>
    ));
    await flush();
    const createdAtMount = fabric.counts.createNode;

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    expect(fabric.counts.createNode, 'press-in rebuilt a subtree').toBe(
      createdAtMount,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(fabric.counts.createNode, 'release rebuilt a subtree').toBe(
      createdAtMount,
    );
  });

  // why: RN's _hasPressHandler gates the underlay — a TouchableHighlight with no press callback is
  // decorative, and flashing an underlay under a touch that passes through it is wrong. The gate is
  // invisible to any test that always supplies onPress, which is how it stayed unported for so long.
  it('paints no underlay when no press handler is supplied', async () => {
    mount(ROOT_TAG, () => (
      <TouchableHighlight
        testID={TARGET}
        underlayColor="#abc"
        style={{ width: BASE_WIDTH }}
      />
    ));
    await flush();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flush();
    expect(feedbackProps().backgroundColor).toBeUndefined();
  });

  // why: THE reason the underlay is a machine and not a `pressed`-derived style. RN re-shows the
  // underlay in onPress and holds it for delayPressOut, so a tap too fast to see still flashes. A
  // port driven off `pressed` cannot express the hold — the flag is already false by then.
  it('holds the underlay past the tap for delayPressOut', async () => {
    const HOLD_MS = 40;
    mount(ROOT_TAG, () => (
      <TouchableHighlight
        testID={TARGET}
        underlayColor="#abc"
        delayPressOut={HOLD_MS}
        onPress={() => {}}
      />
    ));
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(feedbackProps().backgroundColor, 'still held after the tap').toBe(
      '#abc',
    );

    await wait(HOLD_MS + 20);
    await flush();
    expect(feedbackProps().backgroundColor, 'released after the hold').toBe(
      undefined,
    );
  });

  // why: RN fires onShowUnderlay / onHideUnderlay on a real transition only. No adapter in this
  // repo forwarded them at all before the audit.
  it('fires onShowUnderlay and onHideUnderlay around a press', async () => {
    const shown: string[] = [];
    mount(ROOT_TAG, () => (
      <TouchableHighlight
        testID={TARGET}
        onPress={() => {}}
        onShowUnderlay={() => shown.push('show')}
        onHideUnderlay={() => shown.push('hide')}
      />
    ));
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await wait(20);
    await flush();
    expect(shown).toEqual(['show', 'show', 'hide']);
  });

  // why: guards the one place this adapter knowingly diverges from RN. RN clones its child to put
  // the lowered opacity on the CHILD; Solid has no cloneElement, and the wrapper view that would
  // reach it inserts a node into the flex chain between this container and the children. The fake
  // Fabric runs no Yoga, so the damage is unmeasurable headless — this pins the structure instead,
  // so the wrapper cannot be added later without the decision being made again on a device.
  it('inserts no node between the responder and its children', async () => {
    mount(ROOT_TAG, () => (
      <TouchableHighlight testID={TARGET} onPress={() => {}}>
        <TouchableChild />
      </TouchableHighlight>
    ));
    await flush();

    const responder = findCommitted(n => n.props.testID === TARGET);
    if (responder === undefined) throw new Error('responder not committed');
    const childIds = responder.children.map(n => n.props.testID);
    expect(childIds, 'the child must be a DIRECT child').toContain(
      'touchable-child',
    );
  });

  // why: a Solid body runs once, so an underlayColor supplied after mount is a real claim — the
  // pressedStyle closure has to read it when the press fires, not when the component was built.
  it('honors an underlayColor changed after mount', async () => {
    const [underlay, setUnderlay] = createSignal('#abc');
    mount(ROOT_TAG, () => (
      <TouchableHighlight
        testID={TARGET}
        underlayColor={underlay()}
        onPress={() => {}}
      />
    ));
    await flush();

    setUnderlay('#def');
    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    expect(feedbackProps().backgroundColor).toBe('#def');
  });
});

describe('Solid TouchableWithoutFeedback', () => {
  // why: RN's TouchableWithoutFeedback is a pure press-wiring passthrough with NO visual reaction —
  // proves it still synthesizes onPress (it is not an inert View) while deliberately never touching
  // backgroundColor/opacity the way its two siblings do.
  it('fires onPress with no visual feedback applied', async () => {
    let presses = 0;
    mount(ROOT_TAG, () => (
      <TouchableWithoutFeedback
        testID={TARGET}
        style={{ width: BASE_WIDTH }}
        onPress={() => {
          presses++;
        }}
      />
    ));
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    const pressed = feedbackProps();
    expect(pressed.backgroundColor).toBeUndefined();
    expect(pressed.opacity).toBeUndefined();
    expect(pressed.width).toBe(BASE_WIDTH);

    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(presses).toBe(1);
  });

  // why: RN's TouchableWithoutFeedback builds a FULL Pressability config with delayPressIn —
  // "without feedback" means no VISUAL, not no timing. Every adapter here dropped the delay props
  // on the floor, which is silent: the callback still fires, just at the wrong moment.
  it('defers onPressIn past touch-down with delayPressIn', async () => {
    let pressIns = 0;
    mount(ROOT_TAG, () => (
      <TouchableWithoutFeedback
        testID={TARGET}
        delayPressIn={PRESS_DELAY_MS}
        onPressIn={() => {
          pressIns++;
        }}
      />
    ));
    await flush();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    expect(pressIns, 'fired before the delay elapsed').toBe(0);
    await wait(PRESS_DELAY_MS + 20);
    expect(pressIns).toBe(1);
  });
});
