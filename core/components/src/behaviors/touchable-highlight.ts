// TouchableHighlight as an ENGINE-NODE behavior, so it can be an intrinsic tag instead of a
// framework component (`.claude/rules/host-primitive-tier.md`, tier 2).
//
// ONE NODE, THE SAME SIMPLIFICATION EVERY WRAPPER ALREADY SHIPS. RN's own TouchableHighlight
// renders a container View (the responder, the underlay backgroundColor, the whole accessibility
// fold) and CLONES an extra opacity style onto its single child (TouchableHighlight.js:281-320,
// `_createExtraStyles` + `cloneElement`) — closer to TouchableNativeFeedback's clone-onto-child
// shape than to TouchableOpacity's true single node. Every wrapper (Svelte's own comment: "ITEM 7
// IS DELIBERATELY NOT FIXED HERE... exactly as Solid and Angular decided") folds BOTH the underlay
// and the child opacity onto the ONE node instead, because splitting them needs a child to target
// and a framework component holding an opaque children snippet/slot cannot reach one safely. This
// port keeps that already-shipped, already-cross-adapter simplification rather than reopening it —
// `render-touchable-highlight.ts`'s own header says the shared layer "takes no position on where
// they land", so this is a legitimate placement choice, not a new shortcut.
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
  appListenerFor,
  markPropsDirty,
  registerHostBehavior,
  requestCommitFor,
  type IHostBehavior,
  type IPayloadFold,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import { resolveTouchableFocusable } from '../view/render-pressable';
import {
  accessibleUnlessOptedOut,
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
import { resolveHighlightExtraStyles } from '../view/render-touchable-highlight';

export const TOUCHABLE_HIGHLIGHT_TAG = 'touchable-highlight';

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

function stringOr(value: unknown, fallback: string | undefined): unknown {
  return typeof value === 'string' ? value : fallback;
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
      delayPressOut: numberOr(node.props.delayPressOut, 0),
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
        markPropsDirty(node);
        requestCommitFor(node);
      },
      onShowUnderlay: () => {
        const onShowUnderlay = node.props.onShowUnderlay;
        if (typeof onShowUnderlay === 'function') onShowUnderlay();
      },
      onHideUnderlay: () => {
        const onHideUnderlay = node.props.onHideUnderlay;
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

// `id -> nativeID`, the fold every un-lowered wrapper's `foldHostBag` already applies. Not read off
// `HOST_PRIMITIVES`, matching `./touchable-opacity`'s own inline check — that spec entry is
// deliberately withheld until this primitive's wrapper collapses to one node everywhere.
const foldPayload: IPayloadFold = props => {
  const next: Record<string, unknown> = { ...props };
  if (Object.hasOwn(next, 'id')) {
    next.nativeID = next.id;
    delete next.id;
  }
  next.accessible = accessibleUnlessOptedOut(props);
  return next;
};

function tagFold(node: ISymbioteNode): IPayloadFold {
  return props => {
    const next = foldPayload(props);
    const state = states.get(node);
    const hasPressHandler =
      appListenerFor(node, 'press') !== undefined ||
      appListenerFor(node, 'pressIn') !== undefined ||
      appListenerFor(node, 'pressOut') !== undefined ||
      appListenerFor(node, 'longPress') !== undefined;
    const extra =
      state === undefined
        ? undefined
        : resolveHighlightExtraStyles({
            shown: state.shown,
            hasPressHandler,
            underlayColor: stringOr(props.underlayColor, undefined) as
              string | undefined,
            activeOpacity: numberOr(props.activeOpacity, NaN) || undefined,
          });
    if (extra !== undefined) {
      next.style = [props.style, extra.underlay, extra.child];
    }
    next.focusable = resolveTouchableFocusable(
      booleanOr(props.focusable),
      appListenerFor(node, 'press') !== undefined,
      booleanOr(props.disabled),
    );
    return next;
  };
}

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
    foldPayload,
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
  const touchable = createTouchableHighlightBehavior();
  registerHostBehavior(TOUCHABLE_HIGHLIGHT_TAG, {
    ...touchable,
    // Only the TAG binds a per-node fold — see `./touchable-opacity`'s identical comment.
    attach(node: ISymbioteNode): void {
      touchable.attach(node);
      node.payloadFold = tagFold(node);
    },
    onOwnedListenerChange,
  });
}
