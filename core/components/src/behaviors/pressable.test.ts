// The press machine as an engine-node behavior. Two things get their own case: the machine must
// be built AFTER props exist (not at attach, where node.props is `{}`), and the pressed state
// must reach the style registry rather than the framework.
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

// The live tree, never `fabric.find()` (keeps every pre-clone node, so an update reads back as
// its own pre-update self).

// PRODUCTION SHAPE: an adapter resolves the tag through descriptorFor and calls createElement
// with the FABRIC view name — a pressable arrives as `RCTView`. Building the subject as
// createElement(PRESSABLE_TAG) would leave every case below green over a fake registration.
function makePressable(): ISymbioteNode {
  return createElement(PRESSABLE_VIEW_NAME, false, PRESSABLE_TAG);
}

// Slot 0 of the published `[classStyle, explicitStyle]` pair, read back out of the HOST — the
// engine keeps no props, so `propOf` is what a node's own style slot is now.
function classStyleOf(node: ISymbioteNode): unknown {
  const style = propOf(node, 'style');
  return Array.isArray(style) ? style[0] : undefined;
}

// By testID, never by viewName: a pressable's is `RCTView` like every plain view. Reads the
// payload, not the authored bag — `opacity`/`focusable` are folds, never props the app wrote.
function committedPropsOf(
  testID: string,
): Readonly<Record<string, unknown>> | undefined {
  return live.findLive(live.appRoot(), node => node.payload.testID === testID)
    ?.payload;
}

const TOUCH: ISymbioteEvent = {
  nativeEvent: { pageX: 0, pageY: 0, locationX: 0, locationY: 0 },
};

// The engine's real order: `core/engine/src/events/index.ts` bubbles PRESS_IN and only THEN
// negotiates the responder, so `pressIn` arrives BEFORE `startShouldSetResponder`, every gesture.
// A harness claiming the responder first hides a dropped press-in half behind a green suite.
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

  // `node.listeners` is a single-slot Map: without `ownedListeners` the app's own `onPressIn`
  // overwrites the behavior's dispatcher and the machine is never in the path — so this must be
  // asserted through a machine RULE (`disabled`), not a bare call count.
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

  // RN's Pressable hands Pressability the raw `disabled` (Pressable.js:266) — `aria-disabled`
  // reaches only accessibilityState, so a bare pressable with it STILL PRESSES. Button resolves
  // the spellings itself (`./button`, KNOWN DIVERGENCES 2).
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

  // Discriminates the same two hypotheses as `disabled` above, through the other observable
  // difference: the machine also drives the pressed style, which a bare listener callback cannot.
  // Both must move together, on the engine's real pressIn-before-responder-claim sequence.
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

  // Dirtying is not publishing: a press arrives outside every renderer mutation path, so unless
  // the behavior asks for a commit, the screen keeps the unpressed style regardless.
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

  // The focusable pair moved to `core/engine/cpp/tests/js/pressable-payload.itest.ts`:
  // `foldPressableProps` in C++ owns it now, invisible to this harness's TypeScript payload.

  // The other half of keying by tag, and the reason the fix is not "register under the Fabric
  // name": a pressable IS an RCTView, so a Fabric-keyed registry would give the press machine to
  // every plain View in the app — 9 000 of them on a benchmark create.
  it('leaves a plain view of the same Fabric name alone', () => {
    registerPressableBehavior();
    const plain = createElement(PRESSABLE_VIEW_NAME);

    expect(plain.listeners?.get('startShouldSetResponder')).toBeUndefined();
  });

  // why: `Pressability.js:479` returns `blockNativeResponder === true` from `onResponderGrant`,
  // which stops a parent ScrollView from stealing the gesture mid-drag.
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

  // why: every Touchable derives Pressability's `cancelable` from `rejectResponderTermination`;
  // Pressable is the only one of the family with its own `cancelable` prop (Pressable.js:41).
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
