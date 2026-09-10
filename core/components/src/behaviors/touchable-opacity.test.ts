// TouchableOpacity as an engine-node behavior. Three things here fail silently on device with
// every other test green, so each gets a case: the app's own press callbacks must survive the
// fade being spliced in front of them, the fade must beat the AUTHOR's own `opacity` in the
// payload, and the fade must not become the style the next resting-opacity read sees.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  getExplicitStyle,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  registerTouchableOpacityBehavior,
  TOUCHABLE_OPACITY_TAG,
} from './touchable-opacity';
import { DEFAULT_ACTIVE_OPACITY } from '../state/touchable';

const fabric = installFabric();
let nextRootTag = 7100;

// The JS driver reads requestAnimationFrame off the host at call time and Node has none. A ~16ms
// setTimeout shim, the same one `animated-timing.test.ts` installs, so the fade's frame loop runs
// under the fake clock below.
const frameTimers = new Map<number, ReturnType<typeof setTimeout>>();
let nextFrameId = 1;
Object.assign(globalThis, {
  requestAnimationFrame(callback: () => void): number {
    const id = nextFrameId++;
    const timer = setTimeout(() => {
      frameTimers.delete(id);
      callback();
    }, 16);
    frameTimers.set(id, timer);
    return id;
  },
  cancelAnimationFrame(id: number): void {
    const timer = frameTimers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    frameTimers.delete(id);
  },
});

// RN's TouchableOpacity is one `Animated.View`, so the tag resolves to a plain view like
// `pressable` does. Built with the FABRIC name, which is what an adapter passes — building it with
// the tag would make the registry key match by accident.
const TOUCHABLE_VIEW_NAME = 'RCTView';
const TEST_ID = 'subject';

const TOUCH: ISymbioteEvent = {
  nativeEvent: { pageX: 0, pageY: 0, locationX: 0, locationY: 0 },
};

function makeTouchable(): ISymbioteNode {
  return createElement(TOUCHABLE_VIEW_NAME, false, TOUCHABLE_OPACITY_TAG);
}

function mount(node: ISymbioteNode) {
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return surface;
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined)
    throw new Error(`no "${name}" listener — the behavior did not attach`);
  return listener;
}

// The LIVE tree, never `fabric.find()`, which keeps every pre-clone node and would report the
// node's own pre-fade self (`.claude/rules/test-harness-false-greens.md`).
function committedPropsOf(testID: string): Record<string, unknown> {
  const walk = (
    nodes: readonly IFakeNode[],
  ): Record<string, unknown> | undefined => {
    for (const node of nodes) {
      if (node.props.testID === testID) return node.props;
      const hit = walk(node.children);
      if (hit !== undefined) return hit;
    }
    return undefined;
  };
  const hit = walk(fabric.appRoot().children);
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit;
}

// The ENGINE's order: `events/index.ts` bubbles PRESS_IN and only then negotiates the responder,
// so `pressIn` arrives first on every gesture.
function pressIn(node: ISymbioteNode): void {
  listenerOf(node, 'pressIn')(TOUCH);
  listenerOf(node, 'startShouldSetResponder')(TOUCH);
}

// The fade runs on timers and publishes through `setNativeProps`, which queues its commit to the
// microtask boundary.
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(400);
  await Promise.resolve();
}

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
});

describe('touchable-opacity host behavior', () => {
  it('fades to activeOpacity on press and back to the author opacity on release', async () => {
    vi.useFakeTimers();
    registerTouchableOpacityBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    // The author asks for a resting opacity of its own — RN settles back to THIS, not to 1
    // (`_getChildStyleOpacityWithDefault`), and it is also the value the fade must out-rank.
    routeProp(node, 'style', { opacity: 0.6 });
    mount(node);
    await settle();

    // At REST, before any press: RN's Animated.View carries `{opacity: anim}` from its first
    // render, so the key is there from mount and not only once a fade has run.
    expect(committedPropsOf(TEST_ID).opacity).toBe(0.6);

    pressIn(node);
    await settle();
    expect(committedPropsOf(TEST_ID).opacity).toBe(DEFAULT_ACTIVE_OPACITY);

    listenerOf(node, 'pressOut')(TOUCH);
    await settle();
    expect(committedPropsOf(TEST_ID).opacity).toBe(0.6);
  });

  it('still calls the app callbacks the fade is spliced in front of', async () => {
    vi.useFakeTimers();
    registerTouchableOpacityBehavior();
    const onPressIn = vi.fn();
    const onPressOut = vi.fn();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onPressIn', onPressIn);
    routeProp(node, 'onPressOut', onPressOut);
    mount(node);

    pressIn(node);
    await settle();
    listenerOf(node, 'pressOut')(TOUCH);
    await settle();

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  // The feedback loop this design exists to avoid. A fade frame merges onto `node.props.style`, so
  // a resting-opacity read taken from there would see the fade, re-settle to it, and chase itself.
  it('leaves the declarative style untouched while the fade runs', async () => {
    vi.useFakeTimers();
    registerTouchableOpacityBehavior();
    const authored = { opacity: 0.6 };
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'style', authored);
    mount(node);

    pressIn(node);
    await settle();

    expect(getExplicitStyle(node)).toBe(authored);
  });

  // The fold the spec would carry if this primitive had an entry there. A raw `id` is a key no
  // ViewConfig declares — Fabric drops it, the nativeID is lost, and nothing is red.
  it('folds id to nativeID', async () => {
    vi.useFakeTimers();
    registerTouchableOpacityBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'id', 'ident');
    mount(node);
    await settle();

    const props = committedPropsOf(TEST_ID);
    expect(props.nativeID).toBe('ident');
    expect(props.id).toBeUndefined();
  });

  // TouchableOpacity.js:336-340 — three legs, and every one of them is a silent accessibility
  // regression when it is missing: a disabled or handler-less control that stays focusable can be
  // reached by a keyboard, a TV remote or switch control and then does nothing.
  it('focuses only while it has an onPress and is enabled', async () => {
    vi.useFakeTimers();
    registerTouchableOpacityBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    const surface = mount(node);
    await settle();
    // Leg 2, absent. `onPress` is an OWNED name and lives in the stash, which is why a props-only
    // fold cannot answer this and the tag binds its fold to the node.
    expect(committedPropsOf(TEST_ID).focusable).toBe(false);

    // A listener flip dirties no payload by itself, so this also pins `onOwnedListenerChange`.
    routeProp(node, 'onPress', () => {});
    surface.commit();
    await settle();
    expect(committedPropsOf(TEST_ID).focusable).toBe(true);

    // Leg 3.
    routeProp(node, 'disabled', true);
    surface.commit();
    await settle();
    expect(committedPropsOf(TEST_ID).focusable).toBe(false);

    // And an explicit opt-IN does not beat `disabled` — `&&`, never `??`. This is the case a
    // naive `focusable ?? computed` implementation gets wrong, and the one that hands a screen
    // reader a focusable dead control.
    routeProp(node, 'focusable', true);
    surface.commit();
    await settle();
    expect(committedPropsOf(TEST_ID).focusable).toBe(false);
  });

  // NO CASE FOR LEG 1 ALONE, and that is a finding rather than a gap: `focusable` is an ordinary
  // prop, so an authored `false` commits as `false` whether the fold runs or not. Break-tested —
  // deleting the fold leaves such a case green. The opt-out is witnessed only where it CONTRADICTS
  // the other legs, which is the `focusable: true` step above.
  // The control: without a registration nothing writes an opacity at all, so the assertions above
  // cannot be satisfied by an unrelated default.
  it('writes no opacity when the behavior is not registered', async () => {
    vi.useFakeTimers();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    mount(node);
    await settle();

    expect(committedPropsOf(TEST_ID).opacity).toBeUndefined();
    // The same control for the two `focusable` cases above: unregistered, nothing computes it, so
    // a green `false` there cannot be some engine default.
    expect(committedPropsOf(TEST_ID).focusable).toBeUndefined();
    expect(node.listeners?.get('pressIn')).toBeUndefined();
  });
});
