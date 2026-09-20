// TouchableHighlight as an engine-node behavior. RN drives the underlay from THREE Pressability
// callbacks and a real hold timer (TouchableHighlight.js), not from a bare pressed flag — a press
// too fast to see must still flash, and a cancelled gesture must not flash at all. Every case here
// is a way that shape degrades silently to "looks like it works" if it is written as a naive
// pressed-derived style instead.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
} from '../../../test-utils/src/index';
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
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
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

// THE WITNESS CHANGED ON 2026-09-18 AND THE CLAIM DID NOT. Every case below used to ask whether the
// underlay was showing by reading `backgroundColor` off the committed payload. That worked while a
// JS `payloadFold` painted it; the rule is `foldTouchableHighlightUnderlay` in the engine now, and
// this host builds its payloads through the TypeScript `fabricProps`, which deliberately carries no
// copy of the tag rules — so the colour is not here to read and never will be.
//
// What IS here is the bit the machine flipped, recorded from `OP_SET_UNDERLAY_SHOWN`. That is the
// better instrument for this file anyway: every case in it is about WHEN the underlay shows — the
// hold timer, the cancelled gesture, the re-arm — which is the half that stayed in JS. What a
// showing underlay LOOKS like moved out whole, along with the two style cases that asked, and is
// asserted against a real committed payload in
// `core/engine/cpp/tests/js/touchable-highlight-underlay.itest.ts`.
function isUnderlayShown(node: ISymbioteNode): boolean {
  const hit = fabric.find(authored => authored.handle === node);
  if (hit === undefined) throw new Error('the node never reached the host');
  return hit.underlayShown;
}

// Style is published through routeProp, which is synchronous.
function settle(): Promise<void> {
  return Promise.resolve();
}

function pressIn(node: ISymbioteNode): void {
  listenerOf(node, 'pressIn')(TOUCH);
  listenerOf(node, 'startShouldSetResponder')(TOUCH);
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
    expect(isUnderlayShown(node)).toBe(true);

    // The tap already released — pressOut fires right after press, same as a real fast tap.
    listenerOf(node, 'pressOut')(TOUCH);
    await settle();
    expect(isUnderlayShown(node)).toBe(true);

    await vi.advanceTimersByTimeAsync(DELAY_PRESS_OUT);
    // The recomputed style simply carries no backgroundColor once hidden — absent, not a literal
    // null. The before/after pair above already proves the transition; this is its resting state.
    expect(isUnderlayShown(node)).toBe(false);
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
    expect(isUnderlayShown(node)).toBe(true);

    listenerOf(node, 'pressOut')(TOUCH);
    await settle();
    expect(isUnderlayShown(node)).toBe(false);
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
    expect(isUnderlayShown(node)).toBe(true);
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
    expect(isUnderlayShown(node)).toBe(false);
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

  // TouchableHighlight.js:194-197 resolves `disabled ?? accessibilityState.disabled` for its OWN
  // Pressability config (no `aria-disabled` fallback here — RN itself omits it for this one
  // primitive, unlike Opacity/Button/NativeFeedback). This stays a JS-side assertion: unlike the
  // style/focusable cases below, gating `onPress` itself is the press machine's job, never the
  // engine's payload rule.
  it('suppresses the press from accessibilityState.disabled alone', async () => {
    const onPress = vi.fn();
    registerTouchableHighlightBehavior();
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onPress', onPress);
    routeProp(node, 'accessibilityState', { disabled: true });
    mount(node);
    await settle();

    pressIn(node);
    listenerOf(node, 'press')(TOUCH);
    listenerOf(node, 'pressOut')(TOUCH);
    await settle();

    expect(onPress).not.toHaveBeenCalled();
  });

  // THE TWO STYLE CASES LEFT ON 2026-09-18 — "applies a custom underlayColor and activeOpacity" and
  // "defaults to black at 0.85 opacity when unset". They are the only ones here that asked what a
  // showing underlay LOOKS like rather than when it shows, and that is `foldTouchableHighlightUnderlay`
  // in the engine now, reading the same two props the payload builder already strips
  // (`kTouchableFeedbackKeys`). Their twins are "paints the underlay and dims the child while
  // pressed" and "falls back to the underlay and opacity RN itself picks", in
  // `core/engine/cpp/tests/js/touchable-highlight-underlay.itest.ts`, against a real payload.
  //
  // They went as a PAIR with the rule rather than being rewritten onto the new witness, because
  // `underlayShown` cannot tell a crimson underlay from a black one — a bit is the right instrument
  // for "did the machine flip" and the wrong one for "what colour". Every other case in this file
  // survived the move, which is the tell that the split was along the real seam.

  // `focusable` LEFT ON 2026-09-18 — `foldPressableProps` resolves it off the tag now — AND THIS
  // CASE IS WHY THE MOVE MATTERED, not just where it went.
  //
  // It asserted the disabled leg and it PASSED, for weeks, while the real engine shipped the
  // opposite: a disabled TouchableHighlight committed `focusable: true` and stayed in the focus
  // order. The fold read `props.disabled` off the bag, and on a device the engine's pressable rule
  // strips that key BEFORE the fold runs. This harness has no pressable rule — it builds payloads
  // through the TypeScript `fabricProps`, which deliberately carries no copy — so the key was still
  // there and the expression resolved correctly HERE and nowhere else.
  //
  // So the harness that is right to hold no mirror is also, for the same reason, unable to see a
  // rule-ORDERING bug. A fold that reads a key an engine rule removes is invisible to every test on
  // this side; only the committed payload can catch it. It was caught by writing the itest for the
  // port, on unmodified HEAD, before a line of the port had landed.
  //
  // `core/engine/cpp/tests/js/touchable-focusable-payload.itest.ts` carries the case and the rest.

  // `id -> nativeID`, `accessible !== false` and the `disabled -> accessibilityState` merge this
  // file never covered all live in the engine now (`foldIdAlias` / `foldPressableProps`,
  // `SymbioteFabricProps.cpp`), and this host builds its payloads through the TypeScript
  // `fabricProps`, which carries no copy of them. Asserting them here would fail for the right
  // reason today and pass for the wrong one the moment someone mirrored the rule back into JS.
  // Contract: `core/engine/cpp/tests/js/touchable-payload.itest.ts`.

  // The control: without a registration nothing writes an underlay at all, so the assertions above
  // cannot be satisfied by some unrelated default.
  it('does nothing when the behavior is not registered', async () => {
    const node = makeTouchable();
    routeProp(node, 'testID', TEST_ID);
    routeProp(node, 'onPress', () => {});
    mount(node);
    await settle();

    expect(node.listeners?.get('pressIn')).toBeUndefined();
    expect(isUnderlayShown(node)).toBe(false);
  });
});
