// TouchableHighlight as an ENGINE-NODE behavior, so it can be an intrinsic tag instead of a
// framework component (`.claude/rules/host-primitive-tier.md`, tier 2).
//
// ONE NODE, THE SAME SIMPLIFICATION EVERY WRAPPER ALREADY SHIPPED. RN's own TouchableHighlight
// renders a container View (the responder, the underlay backgroundColor, the whole accessibility
// fold) and CLONES an extra opacity style onto its single child (TouchableHighlight.js:281-320,
// `_createExtraStyles` + `cloneElement`). This tag folds both onto the ONE node instead, in
// `foldTouchableHighlightUnderlay` (`SymbioteFabricProps.cpp`) now — see that rule's own header.
//
// KNOWN GAP, and it predates both this port and the fix it reverts. Composing `opacity` onto the
// SAME node as the underlay's `backgroundColor` fades the underlay itself, so `underlayColor:
// 'black'` paints grey rather than black — every adapter's wrapper shipped this, and the rule's own
// header above says so on purpose ("The port keeps that, it does not reopen it"). A 2026-09-15 fix
// (fd39750b) closed it pointwise, in JS, on this one tag; this revert returns to the shared
// (buggy) behavior every adapter already had, which is correct for THIS merge — a merge that also
// changes behavior is unattributable.
//
// The reason the old header gave for not splitting it — "needs a child to target and a framework
// component holding an opaque children slot cannot reach one safely" — no longer holds: that was
// true of JS wrappers, not of the engine. The DESCENDANT seam this needs already exists: a rule
// keyed on `IOwner.tagName`, the same shape `foldCloneOntoChild` uses to reach a
// TouchableNativeFeedback child's own `fabricProps()` call and write onto ITS payload — the write
// `IFirstChild` cannot do, since that seam only reads a child, from the PARENT's own call.
//
// TODO: what actually blocks it is one missing field. `IOwner` carries `{ props, tagName,
// hasPressListener }`; the child would need the owner's `underlayShown` too (currently only on
// `ISelf`, the node's own state) to decide whether to paint at all. Closing this is a new
// descendant-keyed rule plus that one field on `IOwner`, not a `foldTouchableHighlightUnderlay`
// rewrite.
//
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

// THE UNDERLAY FOLD LEFT THIS FILE ON 2026-09-18, and with it the last `payloadFold` on this tag —
// this behavior now costs ZERO trips into JS per commit, down from one on every commit it was dirty
// in (which for a touchable is FIVE at mount alone, because the opacity settle re-commits it).
//
// THE NOTE IT REPLACES SAID THE UNDERLAY WAS "the genuine unportable article" BECAUSE IT IS BUILT
// FROM LIVE PRESS STATE. Half right, and the half it got wrong is the reusable part: `shown` really
// does flip mid-gesture and really is JS's, but the RULE was never made of it. Of four inputs, three
// were already portable — `underlayColor` and `activeOpacity` are ordinary props (ones the engine
// ALREADY strips), and `_hasPressHandler` is listener EXISTENCE, which has crossed since
// `OP_SET_OWNED_LISTENER`. The fourth is one bit. "JS holds it" was never the same claim as "only JS
// can compute it", and this is the third time that distinction has moved a rule.
//
// WHAT CROSSES AND WHAT DOES NOT. `setNodeUnderlayShown` sends the bit on a flip — twice a tap. The
// hold timer, the `press`-then-`pressOut` ordering, the re-arm on a second tap and the
// `onShowUnderlay` / `onHideUnderlay` callbacks all stay here, where Pressability is, because they
// run at gesture rate and call into app code. That is the browser's line too: a UA paints `:active`,
// the page decides what a click means.
//
// `focusable` left earlier the same day and carried a bug out with it — it read `props.disabled` off
// the BAG, which the engine's pressable rule strips, so every DISABLED highlight stayed in the focus
// order. One rule serves both touchable tags now (`foldPressableProps`), so there is no second copy
// to drift; pinned in `core/engine/cpp/tests/js/touchable-focusable-payload.itest.ts`.
//
// The underlay's own contract: `core/engine/cpp/tests/js/touchable-highlight-underlay.itest.ts`.

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
