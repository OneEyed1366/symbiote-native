// TouchableOpacity as an engine-node behavior. Three things here fail silently on device with
// every other test green, so each gets a case: the app's own press callbacks must survive the
// fade being spliced in front of them, the fade must beat the AUTHOR's own `opacity` in the
// payload, and the fade must not become the style the next resting-opacity read sees.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '../../../test-utils/src/index';
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

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
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

function committedPropsOf(testID: string): Record<string, unknown> {
  const hit = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (hit === undefined) throw new Error(`no committed node testID=${testID}`);
  return hit.payload;
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

beforeEach(() => {
  // Every case opens its OWN surface, and `appRoot()` searches the CREATION log — without this it
  // answers with an earlier case's root.
  fabric.reset();
});

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

  // `id -> nativeID` and `accessible !== false` USED TO BE ASSERTED HERE and are not any more, which
  // is a move rather than a loss: both are the engine's rules now (`foldIdAlias` /
  // `foldPressableProps`, `SymbioteFabricProps.cpp`) and this host builds its payloads through the
  // TypeScript `fabricProps`, which deliberately carries no copy of them. An assertion left here
  // would fail for the right reason today and, once someone "fixed" it by mirroring the rule in JS,
  // pass forever for the wrong one. Contract: `core/engine/cpp/tests/js/touchable-payload.itest.ts`.

  // `focusable` LEFT ON 2026-09-18 and it was the LAST thing in this tag's fold, so the tag now
  // costs zero trips into JS. Same reason as the two rules above: it is `foldPressableProps`'s, and
  // this host carries no copy of the tag rules.
  //
  // It held out longer because its middle leg is `onPress !== undefined` — an OWNED name, stashed
  // in JS and never a prop. The comment that used to sit here said a props-only fold "cannot answer
  // this", and that was two claims in one: the callback's IDENTITY genuinely cannot cross, its
  // EXISTENCE is one bit and now does (`OP_SET_OWNED_LISTENER`).
  //
  // Contract, including the late-wiring and cleared-handler cases this used to carry:
  // `core/engine/cpp/tests/js/touchable-focusable-payload.itest.ts`.

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
