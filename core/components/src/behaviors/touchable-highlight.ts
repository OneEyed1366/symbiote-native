// TouchableHighlight as an ENGINE-NODE behavior, so it can be an intrinsic tag instead of a
// framework component (`.claude/rules/host-primitive-tier.md`, tier 2).
//
// TWO NODES, MATCHING RN, FIXED 2026-09-15. RN's own TouchableHighlight renders a container View
// (the responder, the underlay backgroundColor, the whole accessibility fold) and CLONES an extra
// opacity style onto its single child (TouchableHighlight.js:281-320, `_createExtraStyles` +
// `cloneElement`) — `TouchableHighlight-itest.js` shows it directly: shown state commits
// `<rn-view backgroundColor=...><rn-view opacity=... /></rn-view>`, two nodes, not one.
//
// This USED to fold both onto the ONE node (every wrapper had independently made that call —
// Svelte's own comment: "ITEM 7 IS DELIBERATELY NOT FIXED HERE... exactly as Solid and Angular
// decided") — but that is a real, visible bug, not a placement choice: `resolveHighlightExtraStyles`
// (`render-touchable-highlight.ts`) was RN-audited specifically to keep `underlay` and `child`
// apart, and its own header names the exact symptom of merging them back — `opacity` on the SAME
// node as `backgroundColor` fades the underlay itself, so `underlayColor: 'black'` paints grey, not
// black. Verification-round-2 (2026-09-15) traced the contradiction between this file's old
// rationale and that file's warning back to its source and fixed it here: the CHILD now gets the
// opacity via `onChildInserted`, the same clone-onto-child seam `./touchable-native-feedback` uses,
// while this node keeps only the underlay.
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
import { resolveButtonDisabled } from '../view/render-button';
import {
  accessibleUnlessOptedOut,
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
import {
  resolveHighlightExtraStyles,
  type ITouchableHighlightExtraStyles,
} from '../view/render-touchable-highlight';

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

// The child `cloneElement` targets, RN's `React.Children.only` — first child wins, matching
// `./touchable-native-feedback`'s single-child assumption.
const childOf = new WeakMap<ISymbioteNode, ISymbioteNode>();

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function stringOr(value: unknown, fallback: string | undefined): unknown {
  return typeof value === 'string' ? value : fallback;
}

// Shared by the owner's own fold (underlay) and the child's cloned fold (opacity) — one source for
// whether either half should paint at all, so they can never disagree about `shown`.
function computeExtra(
  owner: ISymbioteNode,
): ITouchableHighlightExtraStyles | undefined {
  const state = states.get(owner);
  if (state === undefined) return undefined;
  const hasPressHandler = hasTouchablePressHandler({
    onPress: appListenerFor(owner, 'press'),
    onPressIn: appListenerFor(owner, 'pressIn'),
    onPressOut: appListenerFor(owner, 'pressOut'),
    onLongPress: appListenerFor(owner, 'longPress'),
  });
  return resolveHighlightExtraStyles({
    shown: state.shown,
    hasPressHandler,
    underlayColor: stringOr(owner.props.underlayColor, undefined) as
      string | undefined,
    activeOpacity: numberOr(owner.props.activeOpacity, NaN) || undefined,
  });
}

// The clone-onto-child half, mirroring `./touchable-native-feedback`'s `cloneFold` shape: the
// child's own fold runs first, this only ADDS the active-opacity style on top.
function childOpacityFold(
  owner: ISymbioteNode,
  inner: IPayloadFold | undefined,
): IPayloadFold {
  return props => {
    const base = inner === undefined ? props : inner(props);
    const extra = computeExtra(owner);
    if (extra === undefined) return base;
    return { ...base, style: [base.style, extra.child] };
  };
}

function onChildInserted(owner: ISymbioteNode, child: ISymbioteNode): void {
  if (childOf.get(owner) !== undefined) return;
  childOf.set(owner, child);
  child.payloadFold = childOpacityFold(owner, child.payloadFold);
  markPropsDirty(child);
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
        const child = childOf.get(node);
        if (child !== undefined) {
          markPropsDirty(child);
          requestCommitFor(child);
        }
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
    const extra = computeExtra(node);
    if (extra !== undefined) {
      next.style = [props.style, extra.underlay];
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
  const child = childOf.get(node);
  if (child !== undefined) {
    markPropsDirty(child);
    requestCommitFor(child);
  }
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
      childOf.delete(node);
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
  registerHostBehavior(TOUCHABLE_HIGHLIGHT_TAG, {
    ...touchable,
    // Only the TAG binds a per-node fold — see `./touchable-opacity`'s identical comment.
    attach(node: ISymbioteNode): void {
      touchable.attach(node);
      node.payloadFold = tagFold(node);
    },
    onOwnedListenerChange,
    onChildInserted,
  });
}
