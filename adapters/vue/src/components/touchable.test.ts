// Vue twin of adapters/solid/src/components/touchable/touchable.test.tsx. Drives the real Vue
// renderer through the engine into the fake Fabric slot, firing the raw touch primitives the way
// native would.
//
// SCOPE. The press-scheduling machine and the underlay machine are unit-tested in
// core/components/src/state/touchable.test.ts, and the press lifecycle underneath in Pressable.
// What is Vue-specific — and therefore what this file is for:
//   - each variant drives its REAL visual mechanism through a real engine commit (Animated for
//     Opacity, the container/child style split for Highlight, nothing for WithoutFeedback);
//   - the RN-accurate contract the 2026-08-19 audit added: no minPressDuration floor, the resting
//     opacity taken from the caller's style, the has-press-handler gate, the post-press underlay
//     hold, onShowUnderlay/onHideUnderlay;
//   - the two seams only Vue has: a watch that must NOT fire at mount, and cloneVNode putting the
//     lowered opacity on the child without inserting a wrapper node.
//
// NOT covered here, deliberately: `useNativeDriver: true` (headless has no NativeAnimated module,
// so both values drive the same JS frames) and `resetAnimation()` on unmount (nothing observable
// survives the teardown to assert against). Both ship device-verified only.
//
// rAF is polyfilled (setTimeout-based) so Animated.timing can run to completion; `measure` is
// stubbed because Pressable measures its responder rect on grant. Both are installed before any
// mount, because the engine destructures slot methods off the global on its first commit.

import {
  defineComponent,
  Fragment,
  h,
  ref,
  type VNode,
} from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  unmount,
  View,
  Text,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
} from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 733;
const TARGET = 'touchable-target';
const CHILD = 'touchable-child';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';
const TOUCH_CANCEL = 'topTouchCancel';
const ACTIVE_OPACITY = 0.3;
const BASE_WIDTH = 10;
const PRESS_DELAY_MS = 30;
const HOLD_MS = 40;
const STYLE_OPACITY = 0.6;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const fabric = installFabric();
const installed: unknown = globalThis.nativeFabricUIManager;
if (!isRecord(installed)) throw new Error('fabric slot was not installed');

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

const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// The engine commits on a microtask (renderer.ts's requestCommit) and Vue schedules its re-render
// on one too, so nothing reaches the fake slot until both queues drain.
const flush = async (): Promise<void> => {
  await wait(0);
  await Promise.resolve();
  await Promise.resolve();
};

// One `flush` per iteration lets exactly one scheduled frame run, and the loop re-checks AFTER
// draining — an animation started by a watch that only fires during that drain would be missed by
// a while-loop that tested the queue first.
async function flushFrames(): Promise<void> {
  let guard = 0;
  do {
    await flush();
    guard++;
  } while (pendingFrames.size > 0 && guard < 1_000);
}

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  nextFrameId = 1;
  pendingFrames.clear();
  installRequestAnimationFrame();
});
afterEach(() => {
  unmount(ROOT_TAG);
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

function committedProps(testID: string): Record<string, unknown> {
  const node = findCommitted(n => n.props.testID === testID);
  if (node === undefined)
    throw new Error(`no committed node with testID=${testID}`);
  return node.props;
}

// TouchableOpacity's feedback rides its own inner Animated.View, which carries no testID — it is
// the deepest committed non-box-none RCTView. Read off the COMMITTED tree: fabric.find would hand
// back the mount-time snapshot and read as passing forever.
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

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number')
    throw new Error(
      `${label} should be a number, got ${JSON.stringify(value)}`,
    );
  return value;
}

const childView = (): VNode[] => [h(View, { testID: CHILD })];

describe('Vue TouchableOpacity', () => {
  // why: RN drives TouchableOpacity's feedback with a real Animated.timing, not a discrete style
  // swap. Proves the fade runs through the engine's Animated graph onto the committed node, and
  // that the caller's base style survives the per-frame opacity diff.
  it('animates opacity to activeOpacity on press-in and back on press-out', async () => {
    const events: string[] = [];
    const App = defineComponent({
      setup: () => (): VNode =>
        h(TouchableOpacity, {
          testID: TARGET,
          activeOpacity: ACTIVE_OPACITY,
          style: { width: BASE_WIDTH },
          onPress: () => events.push('press'),
          onPressIn: () => events.push('pressIn'),
          onPressOut: () => events.push('pressOut'),
        }),
    });
    mount(ROOT_TAG, App);
    await flush();

    expect(asNumber(feedbackProps().opacity, 'resting opacity')).toBe(1);
    expect(feedbackProps().width).toBe(BASE_WIDTH);

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'pressed opacity')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );
    expect(feedbackProps().width, 'the base style survived the diff').toBe(
      BASE_WIDTH,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'released opacity')).toBeCloseTo(
      1,
      6,
    );
    expect(events).toEqual(['pressIn', 'press', 'pressOut']);
  });

  // why: RN's Touchables pass minPressDuration: 0 — Pressability's own 130ms floor
  // (Pressability.js:264) never reaches them. Defaulting to 130, which every pre-audit adapter
  // did, delays EVERY press-out by an eighth of a second. Observable as ordering alone: with no
  // floor the deactivation is synchronous, so pressOut has already fired when fireEvent returns.
  it('deactivates synchronously — no minPressDuration floor by default', async () => {
    let pressOuts = 0;
    const App = defineComponent({
      setup: () => (): VNode =>
        h(TouchableOpacity, {
          testID: TARGET,
          onPressOut: () => {
            pressOuts++;
          },
        }),
    });
    mount(ROOT_TAG, App);
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
    const App = defineComponent({
      setup: () => (): VNode =>
        h(TouchableOpacity, {
          testID: TARGET,
          activeOpacity: ACTIVE_OPACITY,
          style: { width: BASE_WIDTH, opacity: STYLE_OPACITY },
        }),
    });
    mount(ROOT_TAG, App);
    await flush();
    expect(asNumber(feedbackProps().opacity, 'initial')).toBeCloseTo(
      STYLE_OPACITY,
      6,
    );

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'pressed')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'released')).toBeCloseTo(
      STYLE_OPACITY,
      6,
    );
  });

  // why: the re-settle watch must stay quiet at mount, or it animates over the value the
  // Animated.Value was just seeded with. `immediate: true` is invisible in the committed opacity
  // (the animation would run from the resting value TO the resting value) — the only trace is that
  // an animation was scheduled at all, so this asserts on the pending frame queue.
  it('schedules no animation at mount', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(TouchableOpacity, {
          testID: TARGET,
          style: { opacity: STYLE_OPACITY },
        }),
    });
    mount(ROOT_TAG, App);
    await flush();
    expect(pendingFrames.size, 'the mount fired the re-settle watch').toBe(0);
  });

  // why: RN's componentDidUpdate re-settles the view when `disabled` flips, so a Touchable
  // disabled mid-press does not stay frozen at its active opacity.
  it('re-settles the opacity when disabled flips after a press-in', async () => {
    const disabled = ref(false);
    const App = defineComponent({
      setup: () => (): VNode =>
        h(TouchableOpacity, {
          testID: TARGET,
          activeOpacity: ACTIVE_OPACITY,
          disabled: disabled.value,
        }),
    });
    mount(ROOT_TAG, App);
    await flush();
    expect(asNumber(feedbackProps().opacity, 'at mount')).toBeCloseTo(1, 6);

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'held')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    disabled.value = true;
    await flushFrames();
    expect(asNumber(feedbackProps().opacity, 'after disabling')).toBeCloseTo(
      1,
      6,
    );
  });

  // why: the same watch must also fire on a changed style opacity — RN compares
  // _getChildStyleOpacityWithDefault(prevProps.style) against the new one, not just `disabled`.
  it('re-settles the opacity when the style opacity changes', async () => {
    const styleOpacity = ref(1);
    const App = defineComponent({
      setup: () => (): VNode =>
        h(TouchableOpacity, {
          testID: TARGET,
          style: { opacity: styleOpacity.value },
        }),
    });
    mount(ROOT_TAG, App);
    await flush();
    expect(asNumber(feedbackProps().opacity, 'at mount')).toBeCloseTo(1, 6);

    styleOpacity.value = STYLE_OPACITY;
    await flushFrames();
    expect(
      asNumber(feedbackProps().opacity, 'after the style change'),
    ).toBeCloseTo(STYLE_OPACITY, 6);
  });

  // why: delayPressIn defers the pressed feedback past a quick swipe-through. Proves the adapter
  // threads the prop into the shared machine rather than ignoring it (the machine's own timing
  // math is unit-tested at core; this is the wiring).
  it('defers pressIn past touch-down with delayPressIn', async () => {
    let pressIns = 0;
    const App = defineComponent({
      setup: () => (): VNode =>
        h(TouchableOpacity, {
          testID: TARGET,
          delayPressIn: PRESS_DELAY_MS,
          onPressIn: () => {
            pressIns++;
          },
        }),
    });
    mount(ROOT_TAG, App);
    await flush();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    expect(pressIns, 'fired before the delay elapsed').toBe(0);
    await wait(PRESS_DELAY_MS + 20);
    expect(pressIns).toBe(1);
  });
});

describe('Vue TouchableHighlight', () => {
  // why: RN's _createExtraStyles keeps the two halves APART — the backgroundColor on the container,
  // the lowered opacity on the CHILD. Folding both onto the container (what every pre-audit adapter
  // did) fades the very underlay it is supposed to reveal, so `underlayColor: '#abc'` paints a
  // washed-out '#abc'. This is the assertion that pins the split.
  it('paints the underlay on the container and the opacity on the child', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          {
            testID: TARGET,
            underlayColor: '#abc',
            activeOpacity: 0.5,
            style: { width: BASE_WIDTH },
            onPress: () => {},
          },
          childView,
        ),
    });
    mount(ROOT_TAG, App);
    await flush();
    expect(committedProps(TARGET).backgroundColor).toBeUndefined();
    expect(committedProps(TARGET).width).toBe(BASE_WIDTH);

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    const container = committedProps(TARGET);
    expect(container.backgroundColor, 'the underlay').toBe('#abc');
    expect(container.opacity, 'must NOT fade the underlay').toBeUndefined();
    expect(container.width, 'the base style survived').toBe(BASE_WIDTH);
    expect(committedProps(CHILD).opacity, 'the child dims').toBe(0.5);

    // The release is ASYNC: onPress arms the hide timer at delayPressOut (0 here), so the underlay
    // outlives the microtask queue by one macrotask. `null`, not `undefined` — the fake slot keeps
    // an explicitly-removed prop as null, which is how a cleared value reads apart from an unset
    // one (the assertions before the press are `toBeUndefined`).
    fabric.fireEvent(handle, TOUCH_END);
    await wait(20);
    await flush();
    expect(committedProps(TARGET).backgroundColor).toBeNull();
    expect(committedProps(CHILD).opacity).toBeNull();
  });

  // why: RN's _hasPressHandler gates the underlay — a TouchableHighlight with no press callback is
  // decorative, and flashing an underlay under a touch that passes through it is wrong. The gate
  // is invisible to any test that always supplies onPress, which is how it stayed unported.
  it('paints no underlay when no press handler is supplied', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          { testID: TARGET, underlayColor: '#abc' },
          childView,
        ),
    });
    mount(ROOT_TAG, App);
    await flush();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flush();
    expect(committedProps(TARGET).backgroundColor).toBeUndefined();
    expect(committedProps(CHILD).opacity).toBeUndefined();
  });

  // why: the gate reads the listeners the PARENT passed, and Vue strips declared-emit listeners
  // from $attrs — so an implementation that looks for `attrs.onLongPress` finds nothing and a
  // long-press-only Touchable silently loses its underlay.
  it('counts an onLongPress-only listener as a press handler', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          { testID: TARGET, underlayColor: '#abc', onLongPress: () => {} },
          childView,
        ),
    });
    mount(ROOT_TAG, App);
    await flush();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flush();
    expect(committedProps(TARGET).backgroundColor).toBe('#abc');
  });

  // why: THE reason the underlay is a machine and not a `pressed`-derived style. RN re-shows the
  // underlay in onPress and holds it for delayPressOut, so a tap too fast to see still flashes. A
  // port driven off `pressed` cannot express the hold — the flag is already false by then.
  it('holds the underlay past the tap for delayPressOut', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          {
            testID: TARGET,
            underlayColor: '#abc',
            delayPressOut: HOLD_MS,
            onPress: () => {},
          },
          childView,
        ),
    });
    mount(ROOT_TAG, App);
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(
      committedProps(TARGET).backgroundColor,
      'still held after the tap',
    ).toBe('#abc');

    await wait(HOLD_MS + 20);
    await flush();
    expect(
      committedProps(TARGET).backgroundColor,
      'released after the hold',
    ).toBeNull();
  });

  // why: the OTHER half of the hold. A cancelled gesture bubbles pressOut with no press before it
  // (core/engine/src/events/index.ts's TOUCH_CANCEL branch), so no hide timer was ever armed and
  // pressOut must hide right away — the hold is for taps, not for a swipe that walked off. Without
  // this the pressOut handler could be deleted outright and every other underlay test stays green.
  it('hides the underlay immediately when the gesture is cancelled', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          {
            testID: TARGET,
            underlayColor: '#abc',
            delayPressOut: HOLD_MS,
            onPress: () => {},
          },
          childView,
        ),
    });
    mount(ROOT_TAG, App);
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    expect(committedProps(TARGET).backgroundColor).toBe('#abc');

    fabric.fireEvent(handle, TOUCH_CANCEL);
    await flush();
    expect(
      committedProps(TARGET).backgroundColor,
      'a cancelled press never armed the hold',
    ).toBeNull();
  });

  // why: RN fires onShowUnderlay / onHideUnderlay on a real transition only, and it runs the
  // VISUAL before the caller's callback (_createPressabilityConfig's order). Interleaving the
  // underlay notifications with the press emits is what makes that order observable at all — the
  // visual has no other synchronous trace, so a swapped order is otherwise invisible.
  it('runs the underlay before the press emit it rides on', async () => {
    const seen: string[] = [];
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          {
            testID: TARGET,
            onPress: () => seen.push('press'),
            onPressIn: () => seen.push('pressIn'),
            onPressOut: () => seen.push('pressOut'),
            onShowUnderlay: () => seen.push('show'),
            onHideUnderlay: () => seen.push('hide'),
          },
          childView,
        ),
    });
    mount(ROOT_TAG, App);
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await wait(20);
    await flush();
    // The second 'show' is RN's: onPress re-shows the underlay and arms the delayPressOut hide,
    // which is why onPressOut declines to hide and 'hide' lands last, off the timer.
    expect(seen).toEqual([
      'show',
      'pressIn',
      'show',
      'press',
      'pressOut',
      'hide',
    ]);
  });

  // why: the child style is applied by cloning the child's vnode, NOT by wrapping it. A wrapper
  // view would insert a node into the flex chain between the responder and the children and
  // silently re-parent any `flex` the child declares — damage the fake Fabric (no Yoga) cannot
  // measure. This pins the structure so the wrapper cannot creep back in.
  it('inserts no node between the responder and its child', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          { testID: TARGET, underlayColor: '#abc', onPress: () => {} },
          childView,
        ),
    });
    mount(ROOT_TAG, App);
    await flush();
    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flush();

    const responder = findCommitted(n => n.props.testID === TARGET);
    if (responder === undefined) throw new Error('responder not committed');
    expect(
      responder.children.map(n => n.props.testID),
      'the child must be a DIRECT child',
    ).toContain(CHILD);
  });

  // why: RN clones ONE child (React.Children.only). With several roots there is no single child to
  // clone, so both halves fold onto the container — the pre-audit approximation. Documented as a
  // deliberate fallback, not a silent one: a regression that dropped the child opacity entirely
  // would look identical without this.
  it('folds the child opacity onto the container when there is no single child', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          {
            testID: TARGET,
            underlayColor: '#abc',
            activeOpacity: 0.5,
            onPress: () => {},
          },
          () => [h(View, { testID: CHILD }), h(View, {})],
        ),
    });
    mount(ROOT_TAG, App);
    await flush();
    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flush();

    expect(committedProps(TARGET).backgroundColor).toBe('#abc');
    expect(committedProps(TARGET).opacity, 'folded onto the container').toBe(
      0.5,
    );
    expect(committedProps(CHILD).opacity).toBeUndefined();
  });

  // why: a single child that is a FRAGMENT (what `v-for` / `<template>` compiles to) is one vnode
  // but carries no props bag — cloning a style onto it drops the style silently. The type guard
  // must catch that, not just the "several roots" case.
  it('folds the child opacity onto the container for a fragment child', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          {
            testID: TARGET,
            underlayColor: '#abc',
            activeOpacity: 0.5,
            onPress: () => {},
          },
          () => [h(Fragment, null, [h(View, { testID: CHILD })])],
        ),
    });
    mount(ROOT_TAG, App);
    await flush();
    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flush();

    expect(committedProps(TARGET).backgroundColor).toBe('#abc');
    expect(committedProps(TARGET).opacity, 'folded onto the container').toBe(
      0.5,
    );
    expect(committedProps(CHILD).opacity).toBeUndefined();
  });

  // why: a Touchable's underlayColor can be re-supplied after mount; the handlers and the extra
  // styles are rebuilt each render, so the press must read the CURRENT value.
  it('honors an underlayColor changed after mount', async () => {
    const color = ref('#abc');
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableHighlight,
          {
            testID: TARGET,
            underlayColor: color.value,
            onPress: () => {},
          },
          childView,
        ),
    });
    mount(ROOT_TAG, App);
    await flush();

    color.value = '#def';
    await flush();
    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flush();
    expect(committedProps(TARGET).backgroundColor).toBe('#def');
  });
});

describe('Vue TouchableWithoutFeedback', () => {
  // why: a pure press-wiring passthrough with NO visual reaction — proves it still synthesizes the
  // press events (it is not an inert View) while never touching backgroundColor/opacity.
  it('fires press with no visual feedback applied', async () => {
    const events: string[] = [];
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          TouchableWithoutFeedback,
          {
            testID: TARGET,
            style: { width: BASE_WIDTH },
            onPress: () => events.push('press'),
            onPressIn: () => events.push('pressIn'),
            onPressOut: () => events.push('pressOut'),
          },
          () => [h(Text, () => ['x'])],
        ),
    });
    mount(ROOT_TAG, App);
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    expect(committedProps(TARGET).backgroundColor).toBeUndefined();
    expect(committedProps(TARGET).opacity).toBeUndefined();
    expect(committedProps(TARGET).width).toBe(BASE_WIDTH);

    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(events).toEqual(['pressIn', 'press', 'pressOut']);
  });

  // why: RN's TouchableWithoutFeedback builds a FULL Pressability config — "without feedback"
  // means no VISUAL, not no timing. Before the audit this adapter spread the delay props straight
  // through, so delayPressIn did nothing at all AND reached Fabric as an unknown native prop.
  it('honors delayPressIn and keeps the delay props off the host', async () => {
    let pressIns = 0;
    const App = defineComponent({
      setup: () => (): VNode =>
        h(TouchableWithoutFeedback, {
          testID: TARGET,
          delayPressIn: PRESS_DELAY_MS,
          onPressIn: () => {
            pressIns++;
          },
        }),
    });
    mount(ROOT_TAG, App);
    await flush();
    expect(committedProps(TARGET).delayPressIn).toBeUndefined();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    expect(pressIns, 'fired before the delay elapsed').toBe(0);
    await wait(PRESS_DELAY_MS + 20);
    expect(pressIns).toBe(1);
  });
});
