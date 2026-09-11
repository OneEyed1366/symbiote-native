// TouchableWithoutFeedback as an ENGINE-NODE behavior — the second primitive that commits NO NODE
// OF ITS OWN (`.claude/rules/host-primitive-tier.md`, tier 2), after `./touchable-native-feedback`.
//
// RN'S TWF RENDERS NOTHING, exactly like TNF: `React.Children.only(props.children)`
// (TouchableWithoutFeedback.js:229) then `cloneElement(element, elementProps, ...children)` (:286).
// All five of our adapters wrapped a `Pressable` around the children instead, so every TWF in every
// app committed a node RN does not.
//
// The SHAPE — anchor tag, `onChildInserted` adoption, a `cloneElement`-shaped `payloadFold` on the
// child, the press machine on the CHILD reading the OWNER — is `./touchable-native-feedback`'s and
// is documented there. Its three KNOWN LIMITS (one child only, a child removed from a live owner
// keeps its machine, `style` is not cloned) hold here verbatim: RN's TWF declares a `style` prop
// (:122, tagged "FIXME: not in doc") and then never puts it in `elementProps`, so it is dead
// upstream too.
//
// WHAT DIFFERS FROM TNF, since the two look like one primitive with a different name:
//
// 1. THE CLONE IS CONDITIONAL. TNF assigns its whole list unconditionally, so an absent prop CLEARS
//    the child's (`cloneElement` copies undefined keys). TWF splits: eight names are computed and
//    assigned unconditionally, and `PASSTHROUGH_PROPS` (:130-153) is copied only
//    `if (props[prop] !== undefined)` (:281). So a TWF with no `testID` LEAVES the child's alone.
// 2. NO ANDROID RIPPLE. `background` / `useForeground` / `getBackgroundProp` and the
//    `setPressed`/`hotspotUpdate` view commands are TNF's alone — they exist to drive the drawable
//    TNF installs, and TWF installs none. `nativeFeedbackRefinement` is therefore NOT reused.
// 3. `onBlur` / `onFocus` ARE cloned (:152-153, in the passthrough list), where TNF drops them.
//    Both are `BASE_EVENTS`, so they route to the stash and trampoline like the other two.
// 4. `accessibilityIgnoresInvertColors` is cloned; `hasTVPreferredFocus` and the five `nextFocus*`
//    are NOT — the reverse of TNF on both counts. Read RN's two lists side by side rather than
//    inheriting either.
// 5. TWF FORWARDS `delayPressIn` / `delayPressOut` to Pressability (:186-188), which the press
//    machine does not own — so the tag layers `../state/touchable`'s scheduler on top, the same
//    machine `./touchable-opacity` uses with the fade replaced by nothing. That is what "without
//    feedback" means: no VISUAL, not no TIMING.
//
// REGISTRATION IS THE HAZARD, not the machine — see `./pressable`. Registered in the same commit
// that deletes the five wrappers, because the registry is keyed by TAG and a wrapper still emitting
// its own `pressable` would put two press machines on one tree.

import {
  ARIA_ALIAS_KEYS,
  appListenerFor,
  foldAriaProps,
  markPropsDirty,
  registerHostBehavior,
  requestCommitFor,
  setBehaviorListener,
  type IHostBehavior,
  type IPayloadFold,
  type ISymbioteEvent,
  type ISymbioteNode,
} from '@symbiote-native/engine';

import {
  resolveDisabledAccessibilityState,
  resolveTouchableFocusable,
} from '../view/render-pressable';
import {
  accessibleUnlessOptedOut,
  asAccessibilityState,
  attachPressMachine,
  booleanOr,
  detachPressMachine,
  type IPressConfigRefinement,
} from './pressable';
import {
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  TOUCHABLE_MIN_PRESS_DURATION_MS,
  type ITouchableFeedbackRuntime,
} from '../state/touchable';

export const TOUCHABLE_WITHOUT_FEEDBACK_TAG = 'touchable-without-feedback';

// TouchableWithoutFeedback.js:130-153, RN's own order, minus two groups that are NOT props here:
// the four `on*` names (forwarded as LISTENERS by `FORWARDED_LISTENERS`) and the five raw `aria-*`
// entries. RN passes those raw because its TWF folds no aria itself and leaves the child View to do
// it; we fold the owner's bag before the clone runs, so `aria-valuemax` has already become
// `accessibilityValue` and `aria-modal` `accessibilityViewIsModal` by this point.
//
// COPIED ONLY WHEN SET (:281), which is the split from TNF's unconditional clone.
const CLONED_WHEN_SET: readonly string[] = [
  'accessibilityActions',
  'accessibilityHint',
  'accessibilityLanguage',
  'accessibilityIgnoresInvertColors',
  'accessibilityLabel',
  'accessibilityRole',
  'accessibilityValue',
  'accessibilityViewIsModal',
  'hitSlop',
  'testID',
];

// :253-276, assigned whatever their value — including `undefined`, which clears the child's, the
// same `cloneElement` semantics TNF relies on. Three of them (`accessibilityElementsHidden`,
// `accessibilityLiveRegion`, `importantForAccessibility`) are in RN's passthrough list TOO, and the
// later conditional copy can only re-assign the same value the aria fold already resolved — so they
// belong here, not above.
const CLONED_ALWAYS: readonly string[] = [
  'accessibilityElementsHidden',
  'accessibilityLiveRegion',
  'importantForAccessibility',
];

// Owner props the four COMPUTED clones read, on top of the two lists above. `focusable` also
// derives from the `press` LISTENER, which is not a prop — see `onOwnedListenerChange`.
const DERIVED_FROM: readonly string[] = [
  'accessible',
  'accessibilityState',
  'disabled',
  'focusable',
  'id',
  'nativeID',
  // Not cloned at all: they configure the scheduler, which reads them live at gesture start. Listed
  // so a mid-mount change still dirties the child and the next commit re-reads them.
  'delayPressIn',
  'delayPressOut',
  'minPressDuration',
];

// Every owner name the child's payload reads. Without it the clone is correct at mount and frozen
// forever after: `markPropsDirty` bubbles UP, so an owner write never reaches the child on its own.
const SLOT_DERIVED: readonly string[] = [
  ...CLONED_WHEN_SET,
  ...CLONED_ALWAYS,
  ...DERIVED_FROM,
  ...ARIA_ALIAS_KEYS,
];

// :148-153. Owned, so the app's callback stashes on the owner and a trampoline on the child reads it
// at dispatch time. `layout` and `accessibilityAction` are Fabric BOOLEAN-GATED events
// (`.claude/rules/fabric-boolean-event-gates.md`), so the trampoline goes in only while the app has
// one wired; `blur` and `focus` are not gated but ride the same wiring, since the question — is
// there a callback to forward — is identical.
const FORWARDED_LISTENERS: readonly string[] = [
  'layout',
  'accessibilityAction',
  'blur',
  'focus',
];

const PRESS_LISTENERS: readonly string[] = [
  'press',
  'pressIn',
  'pressOut',
  'pressMove',
  'longPress',
  'startShouldSetResponder',
  'responderMove',
  'responderTerminationRequest',
];

// The press-scheduling cell, keyed on the OWNER — the node that holds the props and outlives a
// child swap. The machine itself lives on the child.
interface ITimingState {
  readonly runtime: ITouchableFeedbackRuntime;
  // A deferred press-out outlives the tree that armed it, so `detach` has to cancel them.
  readonly timers: Set<ReturnType<typeof setTimeout>>;
}

const states = new WeakMap<ISymbioteNode, ITimingState>();

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function stringOr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * `cloneElement(element, elementProps)` as a payload fold: the child's own props first, the owner's
 * two lists over them. Pure, as `IPayloadFold` requires — the owner is read, never written.
 */
function cloneFold(owner: ISymbioteNode, inner: IPayloadFold | undefined) {
  return (
    props: Readonly<Record<string, unknown>>,
  ): Record<string, unknown> => {
    const next: Record<string, unknown> = {
      ...(inner === undefined ? props : inner(props)),
    };
    // The owner's aria props are on the OWNER, so the engine's own fold at `fabricProps` — which
    // reads the node being committed — never sees them. Run it here over the source bag; the fold
    // returns its input by identity when there is nothing to do.
    const source = owner.hasAriaAlias
      ? foldAriaProps(owner.props)
      : owner.props;

    for (const key of CLONED_ALWAYS) next[key] = source[key];
    for (const key of CLONED_WHEN_SET) {
      if (source[key] !== undefined) next[key] = source[key];
    }

    // :255-266. `onPress` is an OWNED name, so it lives in the stash and never in `props`.
    const disabled = booleanOr(source.disabled);
    next.accessible = accessibleUnlessOptedOut(source);
    next.focusable = resolveTouchableFocusable(
      booleanOr(source.focusable),
      appListenerFor(owner, 'press') !== undefined,
      disabled,
    );
    // :275 gives `id` priority; the passthrough loop then re-assigns a set `nativeID` over it
    // (:280-284), so upstream an explicit `nativeID` wins where TNF's `id` does. NOT reproduced,
    // and deliberately: the spec entry declares `ID_ALIAS`, so on the three adapters that fold in
    // the renderer `id` has already become `nativeID` before this runs and the quirk is
    // unobservable — reproducing it would make the answer depend on WHICH adapter is driving,
    // which is the divergence `.claude/rules/adapter-parity-audit.md` exists to prevent.
    next.nativeID = stringOr(source.id) ?? stringOr(source.nativeID);
    // :257-262 folded by the engine above, then :258-263: an explicit `disabled` overrides the
    // aria/accessibilityState answer.
    next.accessibilityState = resolveDisabledAccessibilityState(
      asAccessibilityState(source.accessibilityState),
      disabled,
    );
    return next;
  };
}

/**
 * `delayPressIn` / `delayPressOut` (:186-188) plus RN's unconditional `minPressDuration: 0` (:190).
 *
 * The scheduler is `../state/touchable`'s — the one `./touchable-opacity` drives its fade with,
 * here with `activate` / `deactivate` forwarding and painting nothing. It reads the OWNER, so the
 * owner is closed over rather than taken from the refinement's argument, which is the CHILD.
 */
function refinementFor(
  owner: ISymbioteNode,
  state: ITimingState,
): IPressConfigRefinement {
  return (_node, config) => {
    const handlers = createTouchableFeedbackHandlers(
      {
        delayPressIn: numberOr(owner.props.delayPressIn, 0),
        delayPressOut: numberOr(owner.props.delayPressOut, 0),
        // Read raw rather than off `config`, which has already defaulted the absent case to the
        // press machine's own 130 ms — a floor RN's Touchables never see.
        minPressDuration: numberOr(
          owner.props.minPressDuration,
          TOUCHABLE_MIN_PRESS_DURATION_MS,
        ),
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
        now: Date.now,
      },
      state.runtime,
      {
        activate(event: ISymbioteEvent): void {
          config.onPressIn?.(event);
        },
        deactivate(event: ISymbioteEvent): void {
          config.onPressOut?.(event);
        },
      },
    );
    return {
      ...config,
      // :190, unconditional. The deactivation floor belongs to the scheduler above, and a second
      // one would defer `onPressOut` by the press machine's 130 ms default on top of it.
      minPressDuration: 0,
      onPressIn: handlers.handlePressIn,
      onPressOut: handlers.handlePressOut,
    };
  };
}

// The app's callback, read at dispatch time so a fresh closure per render costs nothing.
function trampolineFor(owner: ISymbioteNode, name: string) {
  return (event: ISymbioteEvent): void => {
    const listener = appListenerFor(owner, name);
    if (typeof listener === 'function') listener(event);
  };
}

function forwardListener(
  owner: ISymbioteNode,
  child: ISymbioteNode,
  name: string,
  wired: boolean,
): void {
  setBehaviorListener(
    child,
    name,
    wired ? trampolineFor(owner, name) : undefined,
  );
}

// The machine plus the forwarded listeners. Split from adoption because a parked subtree comes back
// with its child and its fold intact but its machine torn down — `attach` re-runs this, and must
// NOT re-chain the fold.
function arm(owner: ISymbioteNode, child: ISymbioteNode): void {
  let state = states.get(owner);
  if (state === undefined) {
    state = { runtime: createTouchableFeedbackRuntime(), timers: new Set() };
    states.set(owner, state);
  }
  attachPressMachine(child, {
    source: owner,
    refine: refinementFor(owner, state),
  });
  for (const name of FORWARDED_LISTENERS) {
    forwardListener(
      owner,
      child,
      name,
      appListenerFor(owner, name) !== undefined,
    );
  }
}

function attach(node: ISymbioteNode): void {
  // First attach has no child yet; a re-attach after the sweep does. See `arm`, which is also what
  // seeds the scheduling cell — a TWF that never adopts a child never needs one.
  if (node.childHost !== undefined) arm(node, node.childHost);
}

function detach(node: ISymbioteNode): void {
  const child = node.childHost;
  if (child !== undefined) detachPressMachine(child);
  const state = states.get(node);
  if (state === undefined) return;
  for (const id of state.timers) clearTimeout(id);
  state.timers.clear();
  states.delete(node);
}

function onChildInserted(node: ISymbioteNode, child: ISymbioteNode): void {
  const previous = node.childHost;
  if (previous === child) return;
  // A replaced child: release the machine still armed on the one that left. `removeChild` clears
  // `childHost` (node.ts), so this only runs when a framework inserts without removing first.
  if (previous !== undefined) detachPressMachine(previous);
  node.childHost = child;
  child.payloadFold = cloneFold(node, child.payloadFold);
  // The owner's props were very likely written BEFORE this child existed (React and Solid set props
  // at createInstance), so the fold owes a run even though nothing was written since. Witnessed by
  // the MOVED-child case, not by a fresh one — `appendChild` already dirties a node it created.
  markPropsDirty(child);
  arm(node, child);
}

// `focusable` is a function of a LISTENER, and a listener flip changes no payload by itself — so
// the commit after it is a no-op and no fold re-runs (`IHostBehavior.onOwnedListenerChange`).
function onOwnedListenerChange(
  node: ISymbioteNode,
  name: string,
  wired: boolean,
): void {
  const child = node.childHost;
  if (child === undefined) return;
  if (FORWARDED_LISTENERS.includes(name)) {
    forwardListener(node, child, name, wired);
    return;
  }
  if (name !== 'press') return;
  markPropsDirty(child);
  requestCommitFor(child);
}

// Idempotent: an adapter entry may be imported more than once in a bundle.
export function registerTouchableWithoutFeedbackBehavior(): void {
  const behavior: IHostBehavior = {
    attach,
    detach,
    onChildInserted,
    onOwnedListenerChange,
    // Owned on the OWNER, which is where the app writes them, and read from there by the machine on
    // the child (`attachPressMachine`'s `source`) and by the trampolines above.
    ownedListeners: [...PRESS_LISTENERS, ...FORWARDED_LISTENERS],
    slotDerived: SLOT_DERIVED,
  };
  registerHostBehavior(TOUCHABLE_WITHOUT_FEEDBACK_TAG, behavior);
}
