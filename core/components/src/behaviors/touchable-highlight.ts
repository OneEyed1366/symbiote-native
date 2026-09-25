// TouchableHighlight as an ENGINE-NODE behavior: RN's own version renders a container View plus
// clones an opacity style onto its child (TouchableHighlight.js:281-320); this tag folds both
// onto the ONE node instead (`foldTouchableHighlightUnderlay` in `SymbioteFabricProps.cpp`).

// KNOWN GAP: composing `opacity` onto the SAME node as the underlay's `backgroundColor` fades the
// underlay itself, so `underlayColor: 'black'` paints grey, not black. TODO: needs a
// descendant-keyed rule plus `underlayShown` added to `IOwner`.

// WHAT IS SHARED AND WHAT IS NEW. The underlay show/hide state machine
// (createHighlightUnderlayHandlers/createHighlightUnderlayRuntime, `../state/touchable`) is already
// framework-agnostic — every wrapper already calls it. New here is only WHERE `shown` lives (a
// WeakMap keyed by node, the same shape `./touchable-opacity`'s `states` map uses) and how a flip
// reaches Fabric: `markPropsDirty` + `requestCommitFor`, the same primitives `./pressable`'s
// `setPressed` composer uses to re-fold after an internal state change — NOT
// `setAnimatedBehaviorStyle`, which exists for a continuously-driven `AnimatedValue` and would be
// the wrong tool for a discrete boolean swap with no easing.
//
// The press machine is `./pressable`'s, composed through `createPressBehavior` — one node may hold
// exactly one press machine, so this tag must not also register the plain `pressable` behavior.
//
// REGISTRATION IS THE HAZARD, not the machine — see `./pressable` for why each adapter's entry does
// a bare `import './register';` that the barrel does not re-export.
//
// TODO(rn-parity, low priority): `TouchableHighlight.js:206-232` also gates the underlay show/hide
// on `onFocus`/`onBlur` (TV remote) and skips its own press-triggered show/hide-after-delay
// entirely when `Platform.isTV`. Neither is wired here. Deliberately not implemented — dead on
// every device this project targets (no tvOS build). Audit skill, "Found, NOT fixed: TV
// (Platform.isTV) focus/blur feedback on TouchableOpacity/Highlight".

import {
  markPropsDirty,
  registerHostBehavior,
  requestCommitFor,
  setNodeUnderlayShown,
  type IHostBehavior,
  type ISymbioteEvent,
  type ISymbioteNode,
  propOf,
} from '@symbiote-native/engine';
import { resolveButtonDisabled } from '../view/render-button';
import {
  asAccessibilityState,
  booleanOr,
  createPressBehavior,
  type IDisabledResolver,
  type IPressConfigRefinement,
} from './pressable';
import {
  createHighlightUnderlayHandlers,
  createHighlightUnderlayRuntime,
  hasTouchablePressHandler,
  type IHighlightUnderlayRuntime,
} from '../state/touchable';
export const TOUCHABLE_HIGHLIGHT_TAG = 'touchable-highlight';

// TouchableHighlight.js:194-197 — `disabled ?? accessibilityState.disabled` (RN omits aria-disabled
// here, unlike Opacity/Button/NativeFeedback — an upstream inconsistency this matches rather than
// "fixes"). Without it, `accessibilityState={{disabled: true}}` alone greys the label but a press
// still fires here.
const touchableHighlightDisabled: IDisabledResolver = props =>
  resolveButtonDisabled(
    booleanOr(props.disabled),
    undefined,
    asAccessibilityState(props.accessibilityState),
  );

interface IHighlightState {
  shown: boolean;
  readonly runtime: IHighlightUnderlayRuntime;
  // Tracked so `detach` can cancel an in-flight hold — a deferred hide outlives the tree that
  // armed it otherwise, the same hazard `./touchable-opacity`'s `timers` set guards.
  readonly timers: Set<ReturnType<typeof setTimeout>>;
}

const states = new WeakMap<ISymbioteNode, IHighlightState>();

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// Runs once per GESTURE, matching `./touchable-opacity`'s `refine` — the config it reads is
// whatever the props hold when a finger lands, and the underlay handlers it builds read `shown`
// through the closure below rather than owning it, so a re-arm reads the current props.
const refine: IPressConfigRefinement = (node, config) => {
  const state = states.get(node);
  if (state === undefined) return config;

  const hasPressHandler = hasTouchablePressHandler({
    onPress: config.onPress,
    onPressIn: config.onPressIn,
    onPressOut: config.onPressOut,
    onLongPress: config.onLongPress,
  });

  const underlay = createHighlightUnderlayHandlers(
    {
      delayPressOut: numberOr(propOf(node, 'delayPressOut'), 0),
      hasPressHandler,
      testOnlyPressed: propOf(node, 'testOnly_pressed') === true,
      schedule: (callback, ms) => {
        const id = setTimeout(() => {
          state.timers.delete(id);
          callback();
        }, ms);
        state.timers.add(id);
        return () => {
          clearTimeout(id);
          state.timers.delete(id);
        };
      },
    },
    state.runtime,
    {
      setShown: (shown: boolean): void => {
        if (state.shown === shown) return;
        state.shown = shown;
        // THE BIT, and nothing else. No style is resolved here: what a showing underlay looks like
        // is `foldTouchableHighlightUnderlay` in the engine, which reads the same two props it
        // already strips from the payload. `markPropsDirty` is still owed — the op marks the host's
        // node, and this marks the JS side's so the commit walk visits it.
        setNodeUnderlayShown(node, shown);
        markPropsDirty(node);
        requestCommitFor(node);
      },
      onShowUnderlay: () => {
        const onShowUnderlay = propOf(node, 'onShowUnderlay');
        if (typeof onShowUnderlay === 'function') onShowUnderlay();
      },
      onHideUnderlay: () => {
        const onHideUnderlay = propOf(node, 'onHideUnderlay');
        if (typeof onHideUnderlay === 'function') onHideUnderlay();
      },
    },
  );

  return {
    ...config,
    // TouchableHighlight.js:203, verbatim: RN hands Pressability a 0 floor here too — what holds
    // the underlay visible is the hold TIMER above, not a press-duration floor.
    minPressDuration: 0,
    onPress: (event: ISymbioteEvent): void => {
      underlay.handlePress(event);
      config.onPress?.(event);
    },
    onPressIn: (event: ISymbioteEvent): void => {
      underlay.handlePressIn(event);
      config.onPressIn?.(event);
    },
    onPressOut: (event: ISymbioteEvent): void => {
      underlay.handlePressOut(event);
      config.onPressOut?.(event);
    },
  };
};

// This behavior binds NO payload fold: `underlayColor`/`activeOpacity` are ordinary props the
// engine already strips, listener existence crosses via `OP_SET_OWNED_LISTENER`, and the one
// live bit crosses via `setNodeUnderlayShown` on a flip — twice a tap.

// What stays in JS: the hold timer, press-then-pressOut ordering, the re-arm on a second tap, and
// the `onShowUnderlay`/`onHideUnderlay` callbacks — they run at gesture rate and call app code.

// `focusable` is `foldPressableProps` now, shared with the other touchable tag so there is no
// second copy to drift — pinned in `touchable-focusable-payload.itest.ts`. Underlay's own
// contract: `touchable-highlight-underlay.itest.ts`.

// A listener flip changes no payload by itself, so the commit after it is a no-op and no fold
// re-runs (`IHostBehavior.onOwnedListenerChange`) — same reason `./touchable-opacity` carries this.
function onOwnedListenerChange(node: ISymbioteNode, name: string): void {
  if (name !== 'press') return;
  markPropsDirty(node);
  requestCommitFor(node);
}

/**
 * The behavior as PARTS, mirroring `./touchable-opacity`'s shape — a tag that is a
 * TouchableHighlight plus something composes this instead of re-implementing the underlay.
 */
export function createTouchableHighlightBehavior(
  disabledOf?: IDisabledResolver,
): IHostBehavior {
  const machine = createPressBehavior(refine, disabledOf);
  return {
    ...machine,
    attach(node: ISymbioteNode): void {
      states.set(node, {
        shown: false,
        runtime: createHighlightUnderlayRuntime(),
        timers: new Set(),
      });
      machine.attach(node);
    },
    detach(node: ISymbioteNode): void {
      machine.detach(node);
      const state = states.get(node);
      if (state === undefined) return;
      for (const id of state.timers) clearTimeout(id);
      state.timers.clear();
      states.delete(node);
    },
  };
}

// Idempotent: an adapter entry may be imported more than once in a bundle.
export function registerTouchableHighlightBehavior(): void {
  const touchable = createTouchableHighlightBehavior(
    touchableHighlightDisabled,
  );
  // Spread whole: the tag used to override `attach` purely to bind a per-node `payloadFold`, and
  // with the underlay rule in the engine there is nothing left to add.
  registerHostBehavior(TOUCHABLE_HIGHLIGHT_TAG, {
    ...touchable,
    onOwnedListenerChange,
  });
}
