// The press machine as an engine-node behavior. Two things here are easy to get wrong in a way
// that leaves every test green and every button dead on device, so both get their own case:
// the machine must be built AFTER props exist (not at attach, where node.props is `{}`), and the
// pressed state must reach the style registry rather than the framework.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// Relative rather than by package name: `core/components` does not declare test-utils, and adding
// a workspace devDependency would need a `pnpm install` across a tree other sessions are working
// in. A test-only import path costs nobody anything.
import {
  createLiveTree,
  installRecordingFabric,
} from '../../../test-utils/src/index';
import {
  appendChild,
  clearGlobalStyles,
  clearHostBehaviors,
  createElement,
  createSurface,
  propOf,
  registerRules,
  removeChild,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { PRESSABLE_TAG, registerPressableBehavior } from './pressable';

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 5000;

// A pressable resolves to a plain view — there is no native pressable component. Which is exactly
// why the registry cannot be keyed by Fabric name: it would attach the press machine to every
// `View` in the app.
const PRESSABLE_VIEW_NAME = 'RCTView';
const TEST_ID = 'subject';

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined) {
    throw new Error(
      `no "${name}" listener installed — the behavior did not attach`,
    );
  }
  return listener;
}

// The LIVE tree, never `fabric.find()` — that searches `created`, which keeps every pre-clone node,
// so a clone-on-write update reads back as its own pre-update self
// (`.claude/rules/test-harness-false-greens.md`).
// PRODUCTION SHAPE, and it is the whole reason this helper exists. An adapter resolves the
// intrinsic tag through `descriptorFor` and calls `createElement` with the FABRIC view name — a
// pressable arrives as `RCTView`, like every other view. Building the subject as
// `createElement(PRESSABLE_TAG)` passes the tag as the Fabric name, which makes the registry key
// match by accident and every test below green while the registration cannot fire in any app.
// That is exactly what happened; a peer session caught it by probing the installed shape.
function makePressable(): ISymbioteNode {
  return createElement(PRESSABLE_VIEW_NAME, false, PRESSABLE_TAG);
}

// Slot 0 of the published `[classStyle, explicitStyle]` pair, read back out of the HOST — the
// engine keeps no props, so `propOf` is what a node's own style slot is now.
function classStyleOf(node: ISymbioteNode): unknown {
  const style = propOf(node, 'style');
  return Array.isArray(style) ? style[0] : undefined;
}

// By testID, never by viewName: the committed tree carries container nodes of the same view name,
// and a pressable's is `RCTView` like everything else. Reads the PAYLOAD (`fabricProps`'s output),
// not the authored bag — `opacity`/`focusable` are folds, never props the app wrote.
function committedPropsOf(
  testID: string,
): Readonly<Record<string, unknown>> | undefined {
  return live.findLive(live.appRoot(), node => node.payload.testID === testID)
    ?.payload;
}

const TOUCH: ISymbioteEvent = {
  nativeEvent: { pageX: 0, pageY: 0, locationX: 0, locationY: 0 },
};

// THE ENGINE'S ORDER, and getting it backwards is what made this suite miss a real bug for a day.
// `core/engine/src/events/index.ts` bubbles PRESS_IN and only THEN calls `negotiateResponder`, so
// `pressIn` arrives BEFORE `startShouldSetResponder` — every gesture, always. A harness that claims
// the responder first hands the machine a world it never sees in production, and the press-in half
// of every gesture can be dropped with all of these green (`.claude/rules/test-harness-false-greens.md` §11).
function press(node: ISymbioteNode): void {
  listenerOf(node, 'pressIn')(TOUCH);
  listenerOf(node, 'startShouldSetResponder')(TOUCH);
}

// A bare `pressIn` with no responder claim after it — the engine's own opening event, on its own.
// Used to check that the press-in half works standalone, which is the shape a gesture actually
// starts with.
function touchWithoutClaiming(node: ISymbioteNode): void {
  listenerOf(node, 'pressIn')(TOUCH);
}

beforeEach(() => {
  // Every case opens its OWN surface, and `appRoot()` searches the CREATION log, so without this
  // it answers with an earlier case's root for every case after the first.
  fabric.reset();
});

afterEach(() => {
  clearHostBehaviors();
  clearGlobalStyles();
});

describe('pressable host behavior', () => {
  it('reads props written AFTER attach, not the empty bag attach saw', () => {
    registerPressableBehavior();
    const onPressIn = vi.fn();
    const node = makePressable();
    // attach() already ran inside createElement, with node.props === {}. Everything below arrives
    // later — which is the whole reason the machine is rebuilt at gesture start.
    routeProp(node, 'onPressIn', onPressIn);
    mount(node);

    press(node);

    expect(onPressIn).toHaveBeenCalledTimes(1);
  });

  it('drives the :active style through the registry, never through the framework', () => {
    registerRules([
      {
        tokens: ['btn'],
        specificity: [0, 1, 0],
        order: 0,
        style: { opacity: 1 },
      },
      {
        tokens: ['btn', ':active'],
        specificity: [0, 2, 0],
        order: 1,
        style: { opacity: 0.6 },
      },
    ]);
    registerPressableBehavior();
    const node = makePressable();
    routeProp(node, 'class', 'btn');
    mount(node);

    expect(classStyleOf(node)).toEqual({ opacity: 1 });

    press(node);

    expect(classStyleOf(node)).toEqual({ opacity: 0.6 });
  });

  // What `ownedListeners` buys, stated as behaviour rather than as structure. `press`/`pressIn`/
  // `pressOut` are base ViewConfig events and `startShouldSetResponder` is a responder event on
  // every node, so `node.listeners` — a single-slot Map — is contested: without the stash the app's
  // own `onPressIn` overwrites the behavior's dispatcher and the machine is never in the path at
  // all. Then `disabled` stops working, the retention rectangle stops working, and the press still
  // "fires", which is why this has to be asserted through a machine RULE and not through a call
  // count.
  it('keeps the machine in the path — a disabled pressable calls nobody', () => {
    registerPressableBehavior();
    const onPressIn = vi.fn();
    const node = makePressable();
    routeProp(node, 'onPressIn', onPressIn);
    routeProp(node, 'disabled', true);
    mount(node);

    press(node);

    expect(onPressIn).not.toHaveBeenCalled();
  });

  // THE OTHER SIDE OF BUTTON'S ASYMMETRY, pinned so nobody "fixes" it. RN's Pressable hands
  // Pressability the RAW prop (`Pressable.js:266`) — `aria-disabled` reaches only the announced
  // accessibilityState (`:229`) — so a bare pressable with `aria-disabled` STILL PRESSES. Button
  // resolves the three spellings in the component and passes the answer down (`Button.js:337`),
  // which is why the resolver is Button's and not the machine's (`./button`, KNOWN DIVERGENCES 2).
  it('still presses under aria-disabled — only Button resolves that', () => {
    registerPressableBehavior();
    const onPressIn = vi.fn();
    const node = makePressable();
    routeProp(node, 'onPressIn', onPressIn);
    routeProp(node, 'aria-disabled', true);
    routeProp(node, 'accessibilityState', { disabled: true });
    mount(node);

    press(node);

    expect(onPressIn).toHaveBeenCalledTimes(1);
  });

  // Discriminates the same two hypotheses as the `disabled` case above, through the OTHER
  // observable difference: the machine also drives the pressed style, and a callback sitting
  // directly in the listener slot cannot. Both must move together.
  //
  // This case previously asserted that a `pressIn` with no responder claim before it does NOTHING —
  // which encoded a real bug as the expected behaviour. The engine bubbles PRESS_IN before it
  // negotiates the responder, so that sequence is the NORMAL one, and a machine that ignores it
  // drops the press-in half of every gesture.
  it('moves the app callback and the pressed style together', () => {
    registerRules([
      {
        tokens: ['btn', ':active'],
        specificity: [0, 2, 0],
        order: 0,
        style: { opacity: 0.6 },
      },
    ]);
    registerPressableBehavior();
    const onPressIn = vi.fn();
    const node = makePressable();
    routeProp(node, 'class', 'btn');
    routeProp(node, 'onPressIn', onPressIn);
    mount(node);

    touchWithoutClaiming(node);

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(classStyleOf(node)).toEqual({ opacity: 0.6 });
  });

  // The other half of the gesture-open flag: it has to be CLEARED at the end, or the second gesture
  // reuses the first one's machine and never sees props written since. Break-tested — without the
  // reset every other case here still passes, so this is the only thing holding that half up.
  it('rebuilds for the NEXT gesture, picking up props written since the last one', () => {
    registerPressableBehavior();
    const first = vi.fn();
    const second = vi.fn();
    const node = makePressable();
    routeProp(node, 'onPressIn', first);
    mount(node);

    press(node);
    listenerOf(node, 'pressOut')(TOUCH);
    expect(first).toHaveBeenCalledTimes(1);

    // The app swaps its handler between gestures — an ordinary re-render.
    routeProp(node, 'onPressIn', second);
    press(node);

    expect(second).toHaveBeenCalledTimes(1);
    expect(
      first,
      'the stale machine must not survive the gesture',
    ).toHaveBeenCalledTimes(1);
  });

  // Dirtying is not publishing. A press arrives from a native event, outside every renderer
  // mutation path, so unless the behavior asks for one nothing ever commits — the node holds the
  // pressed style and the screen keeps the unpressed one. Asserting the node's own style slot
  // cannot see this: `pushClassStyle` writes that synchronously whether or not a commit follows.
  it('commits the pressed style, not just dirties the node', async () => {
    registerRules([
      {
        tokens: ['btn', ':active'],
        specificity: [0, 2, 0],
        order: 0,
        style: { opacity: 0.6 },
      },
    ]);
    registerPressableBehavior();
    const node = makePressable();
    routeProp(node, 'class', 'btn');
    routeProp(node, 'testID', TEST_ID);
    mount(node);

    press(node);
    await Promise.resolve();

    expect(committedPropsOf(TEST_ID)).toMatchObject({
      opacity: 0.6,
    });
  });

  // THE FOCUSABLE PAIR MOVED, with its control:
  // `core/engine/cpp/tests/js/pressable-payload.itest.ts`. Pressable.js:258 is the engine's rule
  // now (`foldPressableProps`), and this harness commits through the TypeScript `fabricProps`,
  // which holds no copy of it — so a case left here would read a payload built by the wrong
  // implementation, which is worse than no case at all.
  //
  // What it was pinning is intact there: a disabled, handler-less Pressable STAYS focusable (the
  // formula has no disabled leg, unlike the Touchable* one), an explicit `false` opts out, and a
  // tag with no behavior grows neither key.

  // The other half of keying by tag, and the reason the fix is not "register under the Fabric
  // name": a pressable IS an RCTView, so a Fabric-keyed registry would give the press machine to
  // every plain View in the app — 9 000 of them on a benchmark create.
  it('leaves a plain view of the same Fabric name alone', () => {
    registerPressableBehavior();
    const plain = createElement(PRESSABLE_VIEW_NAME);

    expect(plain.listeners?.get('startShouldSetResponder')).toBeUndefined();
  });

  // why: `Pressability.js:479` returns `blockNativeResponder === true` from `onResponderGrant`,
  // which is what stops a ScrollView above a claimed Pressable from stealing the gesture mid-drag.
  // Wired through `propOf(source, 'blockNativeResponder')`, the same live-read seam `cancelable`
  // already uses, so a real mount (not just the unit-level `buildPressableListeners` call) proves
  // the prop actually reaches the listener the engine dispatches to on grant.
  it('answers responderGrant from an authored blockNativeResponder', () => {
    registerPressableBehavior();
    const node = makePressable();
    routeProp(node, 'blockNativeResponder', true);
    mount(node);

    touchWithoutClaiming(node);

    expect(listenerOf(node, 'responderGrant')(TOUCH)).toBe(true);
  });

  it('answers responderGrant false when blockNativeResponder is unset', () => {
    registerPressableBehavior();
    const node = makePressable();
    mount(node);

    touchWithoutClaiming(node);

    expect(listenerOf(node, 'responderGrant')(TOUCH)).toBe(false);
  });

  // why: `TouchableOpacity.js:186`/`TouchableHighlight.js:194`/`TouchableNativeFeedback.js:217` all
  // derive Pressability's `cancelable` from `rejectResponderTermination` (`cancelable:
  // !this.props.rejectResponderTermination`) — Pressable itself is the ONLY one of the family with a
  // `cancelable` prop of its own (`Pressable.js:41`). `rebuild()` read only `cancelable`, so every
  // Touchable's `rejectResponderTermination` was a completely dead prop: a Touchable asking to keep
  // its gesture through a parent ScrollView's steal attempt silently kept yielding it.
  it('derives cancelable from rejectResponderTermination when cancelable is not authored', () => {
    registerPressableBehavior();
    const node = makePressable();
    routeProp(node, 'rejectResponderTermination', true);
    mount(node);

    touchWithoutClaiming(node);

    expect(listenerOf(node, 'responderTerminationRequest')(TOUCH)).toBe(false);
  });

  it('lets an explicit cancelable win over rejectResponderTermination', () => {
    registerPressableBehavior();
    const node = makePressable();
    routeProp(node, 'rejectResponderTermination', true);
    routeProp(node, 'cancelable', true);
    mount(node);

    touchWithoutClaiming(node);

    expect(listenerOf(node, 'responderTerminationRequest')(TOUCH)).toBe(true);
  });

  it('cancels its timers when the node is swept away', () => {
    vi.useFakeTimers();
    registerPressableBehavior();
    const onLongPress = vi.fn();
    const parent = createElement('RCTView');
    const node = makePressable();
    routeProp(node, 'onLongPress', onLongPress);
    appendChild(parent, node);
    const surface = mount(parent);

    press(node);
    removeChild(parent, node);
    surface.commit();
    vi.runAllTimers();

    // A long-press timer that survives its node fires into a tree that no longer exists.
    expect(onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  // `configFor`'s compensation: `delayLongPress` left unset resolves to `500 - unstable_pressDelay`
  // (Pressability.js:471-474), so the actual threshold from touch-down stays a constant 500ms
  // however long `unstable_pressDelay` defers the pressed visual — not 500ms ADDED on top of it.
  it('holds the long-press threshold at 500ms from touch-down, not 500ms after unstable_pressDelay', () => {
    vi.useFakeTimers();
    registerPressableBehavior();
    const onLongPress = vi.fn();
    const node = makePressable();
    routeProp(node, 'onLongPress', onLongPress);
    routeProp(node, 'unstable_pressDelay', 200);
    mount(node);

    press(node);
    vi.advanceTimersByTime(499);
    expect(onLongPress).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
