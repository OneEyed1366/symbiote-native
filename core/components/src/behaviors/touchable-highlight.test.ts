// TouchableHighlight as an engine-node behavior. RN drives the underlay from THREE Pressability
// callbacks and a real hold timer (TouchableHighlight.js), not from a bare pressed flag — a press
// too fast to see must still flash, and a cancelled gesture must not flash at all. Every case here
// is a way that shape degrades silently to "looks like it works" if it is written as a naive
// pressed-derived style instead.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFabric, type IFakeNode } from '../../../test-utils/src/index';
import {
  clearHostBehaviors,
  createElement,
  createSurface,
  routeProp,
  type IListener,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  registerTouchableHighlightBehavior,
  TOUCHABLE_HIGHLIGHT_TAG,
} from './touchable-highlight';
import {
  DEFAULT_HIGHLIGHT_CHILD_OPACITY,
  DEFAULT_UNDERLAY_COLOR,
} from '../state/touchable';

const fabric = installFabric();
let nextRootTag = 7300;

// RN's TouchableHighlight is one View (the underlay + child both fold onto it here — see the
// behavior file's own header for why, this port keeps the wrapper's already-shipped
// single-node simplification). Built with the FABRIC name, matching every sibling test in this
// file's family.
const TOUCHABLE_VIEW_NAME = 'RCTView';
const TEST_ID = 'subject';
const DELAY_PRESS_OUT = 100;

const TOUCH: ISymbioteEvent = {
  nativeEvent: { pageX: 0, pageY: 0, locationX: 0, locationY: 0 },
};

function makeTouchable(): ISymbioteNode {
  return createElement(TOUCHABLE_VIEW_NAME, false, TOUCHABLE_HIGHLIGHT_TAG);
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

// The LIVE tree, never `fabric.find()`, which keeps every pre-clone node
// (`.claude/rules/test-harness-false-greens.md`).
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

// Style is published through routeProp, which is synchronous.
function settle(): Promise<void> {
  return Promise.resolve();
}

function pressIn(node: ISymbioteNode): void {
  listenerOf(node, 'pressIn')(TOUCH);
  listenerOf(node, 'startShouldSetResponder')(TOUCH);
}

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
});

describe('touchable-highlight host behavior', () => {
  // why: RN's onPress re-shows the underlay and holds it for delayPressOut past the tap
  // (TouchableHighlight.js: `_showUnderlay(); this._hideTimeout = setTimeout(_hideUnderlay, …)`),
  // so a tap fast enough that press-out fires in the same tick must still flash visibly.
  it('shows the underlay on a completed press and holds it for delayPressOut', async () => {
    vi.useFakeTimers();
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'delayPressOut', DELAY_PRESS_OUT);
    routeProp(node, 'onPress', () => {});
    mount(node);
    await settle();

    pressIn(node);
    listenerOf(node, 'press')(TOUCH);
    await settle();
    expect(committedPropsOf(TEST_ID).backgroundColor).toBe(
      DEFAULT_UNDERLAY_COLOR,
    );

    // The tap already released — pressOut fires right after press, same as a real fast tap.
    listenerOf(node, 'pressOut')(TOUCH);
    await settle();
    expect(committedPropsOf(TEST_ID).backgroundColor).toBe(
      DEFAULT_UNDERLAY_COLOR,
    );

    await vi.advanceTimersByTimeAsync(DELAY_PRESS_OUT);
    // A key present on the prior commit and absent from this one diffs to `null` — the engine's
    // own unset marker (`commit.ts`: `if (!(key in next)) out[key] = null;`), not an omitted key.
    expect(committedPropsOf(TEST_ID).backgroundColor).toBeNull();
  });

  // why: a gesture that never fires `press` (dragged off before release) armed no hide timer, so
  // RN's `_hideUnderlay` on pressOut runs immediately — `handlePressOut`'s `hideTimerCancel ===
  // undefined` branch. A naive "always hold for delayPressOut" implementation flashes an underlay
  // on a touch the app never registered as a press.
  it('hides immediately on pressOut when the gesture never completed', async () => {
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'delayPressOut', DELAY_PRESS_OUT);
    routeProp(node, 'onPress', () => {});
    mount(node);
    await settle();

    pressIn(node);
    await settle();
    expect(committedPropsOf(TEST_ID).backgroundColor).toBe(
      DEFAULT_UNDERLAY_COLOR,
    );

    listenerOf(node, 'pressOut')(TOUCH);
    await settle();
    expect(committedPropsOf(TEST_ID).backgroundColor).toBeNull();
  });

  // why: `handlePressIn` clears any pending hide first — a second tap landing during the hold
  // window must not have its underlay stolen out from under it by the first tap's timer.
  it('re-showing during the hold window cancels the pending hide', async () => {
    vi.useFakeTimers();
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'delayPressOut', DELAY_PRESS_OUT);
    routeProp(node, 'onPress', () => {});
    mount(node);
    await settle();

    pressIn(node);
    listenerOf(node, 'press')(TOUCH);
    listenerOf(node, 'pressOut')(TOUCH);
    await settle();

    await vi.advanceTimersByTimeAsync(DELAY_PRESS_OUT / 2);
    pressIn(node);
    await settle();
    // If the first hold timer had survived, it would fire here and hide the underlay early.
    await vi.advanceTimersByTimeAsync(DELAY_PRESS_OUT / 2 + 1);
    expect(committedPropsOf(TEST_ID).backgroundColor).toBe(
      DEFAULT_UNDERLAY_COLOR,
    );
  });

  // why: RN's `_hasPressHandler` gate — a decorative TouchableHighlight with no press callback
  // must not flash an underlay under a touch that merely passes through it.
  it('never shows an underlay without a press handler', async () => {
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    mount(node);
    await settle();

    pressIn(node);
    await settle();
    expect(committedPropsOf(TEST_ID).backgroundColor).toBeUndefined();
  });

  // why: `onShowUnderlay`/`onHideUnderlay` are app-facing notifications and must fire exactly once
  // per real transition, not once per event the machine happens to receive.
  it('fires onShowUnderlay and onHideUnderlay only on real transitions', async () => {
    vi.useFakeTimers();
    const onShowUnderlay = vi.fn();
    const onHideUnderlay = vi.fn();
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'delayPressOut', 0);
    routeProp(node, 'onPress', () => {});
    routeProp(node, 'onShowUnderlay', onShowUnderlay);
    routeProp(node, 'onHideUnderlay', onHideUnderlay);
    mount(node);
    await settle();

    pressIn(node);
    await settle();
    expect(onShowUnderlay).toHaveBeenCalledTimes(1);

    listenerOf(node, 'press')(TOUCH);
    await settle();
    // Already shown — `show()` still no-ops the callback exactly once per transition, so a second
    // press-driven show while already shown must not double-fire.
    expect(onShowUnderlay).toHaveBeenCalledTimes(2);

    listenerOf(node, 'pressOut')(TOUCH);
    // delayPressOut: 0 still schedules the hide through a timer (real RN behavior — the hold is
    // driven by a timer regardless of its duration), so a real hide waits for it to fire.
    await vi.advanceTimersByTimeAsync(0);
    expect(onHideUnderlay).toHaveBeenCalledTimes(1);
  });

  it('still calls the app own press callbacks the underlay machine is spliced in front of', async () => {
    const onPress = vi.fn();
    const onPressIn = vi.fn();
    const onPressOut = vi.fn();
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onPress', onPress);
    routeProp(node, 'onPressIn', onPressIn);
    routeProp(node, 'onPressOut', onPressOut);
    mount(node);
    await settle();

    pressIn(node);
    listenerOf(node, 'press')(TOUCH);
    listenerOf(node, 'pressOut')(TOUCH);
    await settle();

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  // why: RN settles back to the CALLER's activeOpacity/underlayColor, not a hardcoded one —
  // TouchableHighlight.js's `_createExtraStyles` reads both off props with its own defaults.
  it('applies a custom underlayColor and activeOpacity, and the wrapper defaults otherwise', async () => {
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onPress', () => {});
    routeProp(node, 'underlayColor', 'crimson');
    routeProp(node, 'activeOpacity', 0.5);
    mount(node);
    await settle();

    pressIn(node);
    await settle();
    const props = committedPropsOf(TEST_ID);
    expect(props.backgroundColor).toBe('crimson');
    expect(props.opacity).toBe(0.5);
  });

  it('defaults to black at 0.85 opacity when unset', async () => {
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onPress', () => {});
    mount(node);
    await settle();

    pressIn(node);
    await settle();
    const props = committedPropsOf(TEST_ID);
    expect(props.backgroundColor).toBe(DEFAULT_UNDERLAY_COLOR);
    expect(props.opacity).toBe(DEFAULT_HIGHLIGHT_CHILD_OPACITY);
  });

  // TouchableHighlight.js's render: `focusable={this.props.focusable !== false &&
  // this.props.onPress !== undefined && !this.props.disabled}`.
  it('focuses only while it has an onPress and is enabled', async () => {
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    const surface = mount(node);
    await settle();
    expect(committedPropsOf(TEST_ID).focusable).toBe(false);

    routeProp(node, 'onPress', () => {});
    surface.commit();
    await settle();
    expect(committedPropsOf(TEST_ID).focusable).toBe(true);

    routeProp(node, 'disabled', true);
    surface.commit();
    await settle();
    expect(committedPropsOf(TEST_ID).focusable).toBe(false);
  });

  it('folds id to nativeID', async () => {
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'id', 'ident');
    mount(node);
    await settle();

    const props = committedPropsOf(TEST_ID);
    expect(props.nativeID).toBe('ident');
    expect(props.id).toBeUndefined();
  });

  // The control: without a registration nothing writes an underlay at all, so the assertions above
  // cannot be satisfied by some unrelated default.
  it('does nothing when the behavior is not registered', async () => {
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onPress', () => {});
    mount(node);
    await settle();

    expect(node.listeners?.get('pressIn')).toBeUndefined();
    expect(committedPropsOf(TEST_ID).backgroundColor).toBeUndefined();
    expect(committedPropsOf(TEST_ID).focusable).toBeUndefined();
  });
});
