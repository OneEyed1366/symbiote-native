// Vue twin of adapters/react/src/components/touchable/touchable.test.tsx. Drives the real Vue
// renderer through the engine into the fake Fabric slot, firing the raw touch primitives the way
// native would.
//
// `<touchable-opacity>` / `<touchable-highlight>` are TAGS now — the press machine, the opacity
// fade and the underlay show/hide machine all live on the engine node
// (core/components/src/behaviors/touchable-{opacity,highlight}.ts). The press-scheduling machine
// and the underlay machine are unit-tested there and in core/components/src/state/touchable.test.ts;
// this file proves the Vue-side WIRING: that mounting the tag through the real reconciler actually
// drives the real mechanism (Animated for Opacity, a single-node style fold for Highlight) through
// a real engine commit.
//
// Both halves of a TouchableHighlight's feedback land on the ONE node — a tag has no render to
// clone a style onto a child with (core/components/src/behaviors/touchable-highlight.ts). There is
// no cloneVNode split left to guard.
//
// rAF is polyfilled (setTimeout-based) so Animated.timing can run to completion; `measure` is
// stubbed because Pressable measures its responder rect on grant. Both are installed before any
// mount, because the engine destructures slot methods off the global on its first commit.

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount, unmount } from '@symbiote-native/vue';
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
// draining — an animation started during that drain would be missed by a while-loop that tested
// the queue first.
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

// The responder is the tag's own node, found by the testID every mount below sets — one node now,
// for both variants.
function responderHandle(): unknown {
  const node = findCommitted(n => n.props.testID === TARGET);
  if (node === undefined)
    throw new Error(`no node created with testID=${TARGET}`);
  return node.instanceHandle;
}

function committedProps(testID: string): Record<string, unknown> {
  const node = findCommitted(n => n.props.testID === testID);
  if (node === undefined)
    throw new Error(`no committed node with testID=${testID}`);
  return node.props;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== 'number')
    throw new Error(
      `${label} should be a number, got ${JSON.stringify(value)}`,
    );
  return value;
}

const childView = (): VNode[] => [h('view', { testID: CHILD })];

describe('Vue TouchableOpacity', () => {
  // why: RN drives TouchableOpacity's feedback with a real Animated.timing, not a discrete style
  // swap. Proves the fade runs through the engine's Animated graph onto the committed node — the
  // SAME node the tag itself is, not an inner Animated.View leaf.
  it('animates opacity to activeOpacity on press-in and back on press-out', async () => {
    const events: string[] = [];
    const App = defineComponent({
      setup: () => (): VNode =>
        h('touchable-opacity', {
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

    expect(asNumber(committedProps(TARGET).opacity, 'resting opacity')).toBe(1);
    expect(committedProps(TARGET).width).toBe(BASE_WIDTH);

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(
      asNumber(committedProps(TARGET).opacity, 'pressed opacity'),
    ).toBeCloseTo(ACTIVE_OPACITY, 6);
    expect(
      committedProps(TARGET).width,
      'the base style survived the diff',
    ).toBe(BASE_WIDTH);

    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(
      asNumber(committedProps(TARGET).opacity, 'released opacity'),
    ).toBeCloseTo(1, 6);
    expect(events).toEqual(['pressIn', 'press', 'pressOut']);
  });

  // why: RN's Touchables pass minPressDuration: 0 — Pressability's own 130ms floor
  // (Pressability.js:264) never reaches them. Observable as ordering alone: with no floor the
  // deactivation is synchronous, so pressOut has already fired when fireEvent returns.
  it('deactivates synchronously — no minPressDuration floor by default', async () => {
    let pressOuts = 0;
    const App = defineComponent({
      setup: () => (): VNode =>
        h('touchable-opacity', {
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
  // asks for, not at a hard 1, and seeds the Animated.Value with it — first paint is not a jump to
  // fully opaque on a Touchable styled `opacity: 0.6`.
  it('rests at the style opacity, not at 1', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h('touchable-opacity', {
          testID: TARGET,
          activeOpacity: ACTIVE_OPACITY,
          style: { width: BASE_WIDTH, opacity: STYLE_OPACITY },
        }),
    });
    mount(ROOT_TAG, App);
    await flush();
    expect(asNumber(committedProps(TARGET).opacity, 'initial')).toBeCloseTo(
      STYLE_OPACITY,
      6,
    );

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flushFrames();
    expect(asNumber(committedProps(TARGET).opacity, 'pressed')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flushFrames();
    expect(asNumber(committedProps(TARGET).opacity, 'released')).toBeCloseTo(
      STYLE_OPACITY,
      6,
    );
  });

  // why: RN's componentDidUpdate re-settles the view when `disabled` flips, so a Touchable
  // disabled mid-press does not stay frozen at its active opacity.
  it('re-settles the opacity when disabled flips after a press-in', async () => {
    const disabled = ref(false);
    const App = defineComponent({
      setup: () => (): VNode =>
        h('touchable-opacity', {
          testID: TARGET,
          activeOpacity: ACTIVE_OPACITY,
          disabled: disabled.value,
        }),
    });
    mount(ROOT_TAG, App);
    await flush();
    expect(asNumber(committedProps(TARGET).opacity, 'at mount')).toBeCloseTo(
      1,
      6,
    );

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flushFrames();
    expect(asNumber(committedProps(TARGET).opacity, 'held')).toBeCloseTo(
      ACTIVE_OPACITY,
      6,
    );

    disabled.value = true;
    await flushFrames();
    expect(
      asNumber(committedProps(TARGET).opacity, 'after disabling'),
    ).toBeCloseTo(1, 6);
  });

  // why: a style changed after mount must keep reaching the committed node — this Touchable has
  // no second node to hide a freeze behind any more (the concern that used to live in its own
  // touchable-style-updates.test.ts, for a two-node shape that no longer exists).
  it('a style changed after mount reaches the committed node', async () => {
    const style = ref<Record<string, number>>({ margin: 1 });
    const App = defineComponent({
      setup: () => (): VNode =>
        h('touchable-opacity', { testID: TARGET, style: style.value }),
    });
    mount(ROOT_TAG, App);
    await flush();
    expect(committedProps(TARGET).margin).toBe(1);
    expect(committedProps(TARGET).borderWidth).toBeUndefined();

    style.value = { margin: 2, borderWidth: 7 };
    await flush();
    expect(committedProps(TARGET).borderWidth).toBe(7);
    expect(committedProps(TARGET).margin).toBe(2);
  });

  // why: delayPressIn defers the pressed feedback past a quick swipe-through. Proves the adapter
  // threads the prop into the shared machine (the machine's own timing math is unit-tested at
  // core; this is the wiring).
  it('defers pressIn past touch-down with delayPressIn', async () => {
    let pressIns = 0;
    const App = defineComponent({
      setup: () => (): VNode =>
        h('touchable-opacity', {
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
  // why: RN's _createExtraStyles splits the underlay color and the lowered opacity across a
  // container and its child — a tag has no render to clone a style onto a child with, so both
  // halves fold onto the ONE node instead (core/components/src/behaviors/touchable-highlight.ts).
  // The app's own child is an ordinary child, untouched.
  it('paints the underlay and the pressed opacity on the one node', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          'touchable-highlight',
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
    expect(committedProps(CHILD).opacity).toBeUndefined();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    expect(committedProps(TARGET).backgroundColor, 'the underlay').toBe('#abc');
    expect(committedProps(TARGET).opacity, 'the lowered opacity').toBe(0.5);
    expect(committedProps(TARGET).width, 'the base style survived').toBe(
      BASE_WIDTH,
    );
    expect(
      committedProps(CHILD).opacity,
      'the child is untouched',
    ).toBeUndefined();

    // The release is ASYNC: onPress arms the hide timer at delayPressOut (0 here), so the underlay
    // outlives the microtask queue by one macrotask.
    fabric.fireEvent(handle, TOUCH_END);
    await wait(20);
    await flush();
    // `null`, not `undefined` — the fake slot keeps an explicitly-removed prop as null.
    expect(committedProps(TARGET).backgroundColor).toBeNull();
    expect(committedProps(TARGET).opacity).toBeNull();
  });

  // why: RN's _hasPressHandler gates the underlay — a decorative TouchableHighlight with no press
  // callback must not flash on a touch that merely passes through it.
  it('paints no underlay when no press handler is supplied', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          'touchable-highlight',
          { testID: TARGET, underlayColor: '#abc' },
          childView,
        ),
    });
    mount(ROOT_TAG, App);
    await flush();

    fabric.fireEvent(responderHandle(), TOUCH_START);
    await flush();
    expect(committedProps(TARGET).backgroundColor).toBeUndefined();
  });

  it('counts an onLongPress-only listener as a press handler', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          'touchable-highlight',
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
  // underlay in onPress and holds it for delayPressOut, so a tap too fast to see still flashes.
  it('holds the underlay past the tap for delayPressOut', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          'touchable-highlight',
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

  // why: the OTHER half of the hold. A cancelled gesture bubbles pressOut with no press before it,
  // so no hide timer was ever armed and pressOut must hide right away.
  it('hides the underlay immediately when the gesture is cancelled', async () => {
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          'touchable-highlight',
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

  // why: RN fires onShowUnderlay / onHideUnderlay on a real transition only, and runs the visual
  // BEFORE the caller's callback (_createPressabilityConfig's order).
  it('runs the underlay before the press emit it rides on', async () => {
    const seen: string[] = [];
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          'touchable-highlight',
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

  // why: an underlayColor can be re-supplied after mount; the behavior reads the CURRENT props on
  // each press, not a value captured at attach.
  it('honors an underlayColor changed after mount', async () => {
    const color = ref('#abc');
    const App = defineComponent({
      setup: () => (): VNode =>
        h(
          'touchable-highlight',
          { testID: TARGET, underlayColor: color.value, onPress: () => {} },
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

// TouchableWithoutFeedback's own block left with the wrapper: it is a tag now, and both its press
// wiring and its delayPressIn/delayPressOut scheduler are covered against the COMMITTED tree in
// `core/components/src/behaviors/touchable-without-feedback.test.ts`.

// RN gives Pressable a ONE-leg focusable default (Pressable.js:258) and the Touchables a THREE-leg
// one (TouchableOpacity.js:336-340, TouchableHighlight.js:370-374), so each tag folds its own.
describe('Vue Touchable* focusable', () => {
  const VARIANTS = ['touchable-opacity', 'touchable-highlight'];

  async function mountWith(
    tag: string,
    props: Record<string, unknown>,
  ): Promise<void> {
    const App = defineComponent({
      setup: () => (): VNode => h(tag, { testID: TARGET, ...props }),
    });
    mount(ROOT_TAG, App);
    await flush();
  }

  for (const tag of VARIANTS) {
    // Leg 2, read off the app's own onPress — the machine's synthesized handler is always defined,
    // so resolving one level down could never answer false.
    it(`${tag} stays out of the focus order without an onPress`, async () => {
      await mountWith(tag, {});
      expect(committedProps(TARGET).focusable).toBe(false);
    });

    it(`${tag} focuses once it has an onPress`, async () => {
      await mountWith(tag, { onPress: () => {} });
      expect(committedProps(TARGET).focusable).toBe(true);
    });

    // Leg 3, the case a `focusable ?? computed` implementation gets wrong: an explicit opt-IN
    // still loses to `disabled`.
    it(`${tag} refuses focus while disabled, opt-in notwithstanding`, async () => {
      await mountWith(tag, {
        onPress: () => {},
        disabled: true,
        focusable: true,
      });
      expect(committedProps(TARGET).focusable).toBe(false);
    });
  }
});
