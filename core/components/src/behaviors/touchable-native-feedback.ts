// TouchableNativeFeedback as an ENGINE-NODE behavior — the one primitive that must commit NO NODE
// OF ITS OWN (`.claude/rules/host-primitive-tier.md`, tier 2).
//
// RN'S TNF RENDERS NOTHING. `render()` takes `React.Children.only(this.props.children)`
// (TouchableNativeFeedback.js:289) and returns `cloneElement(element, {…}, ...children)` (:339) —
// the child IS the responder, carries the ripple background, and takes the whole accessibility
// fold. All five of our adapters render a `Pressable` around a feedback `View` instead, so every
// TNF in every app commits a node RN does not, and the mistake has already spread: our Pressable
// wrapper and our TouchableOpacity wrapper both copied that inner view from here
// (`.claude/rules/adapter-parity-audit.md`, "the OTHER half turned up a gap on BOTH paths").
//
// WHY THE FIX CANNOT BE PER ADAPTER. At the FRAMEWORK level React, Vue and Solid can clone a child
// element; Svelte's children arrive as a snippet and Angular's through `<ng-content>`, and neither
// can have props written onto them there. At the ENGINE level all five can reach the child node.
// So the clone belongs below the frameworks, once, or it is five copies of one fold.
//
// ---------------------------------------------------------------------------------------------
// THE SHAPE, and which existing engine seam does each half:
//
//   commits nothing     the tag resolves to ANCHOR_COMPONENT (component-names), so the node is
//                       BORN skipped: `renderableChildren` (commit.ts) drops it and flattens its
//                       child into the grandparent's renderable list. Not a new concept — that is
//                       precisely what an anchor is, and TNF is its third instance after Vue's
//                       fragment placeholders and Angular's non-painting component hosts.
//   finds its child     `onChildInserted`, the one hook this needed. `buildStructure` cannot do it:
//                       it runs at `attach`, inside `createElement`, and the child is the
//                       FRAMEWORK'S and does not exist yet.
//   clones the props    a `payloadFold` on the CHILD reading the owner's bag, re-run because
//                       `slotDerived` marks the child's props dirty on every owner write. The
//                       alternative — redirecting each prop onto the child through `slotPropsExcept`
//                       — was rejected: adapters disagree about ORDER (React writes props before
//                       children, Vue mounts children before props), so a redirect silently drops
//                       every prop written before the child arrives, on some adapters only.
//   presses             the press machine on the CHILD, reading the OWNER (`attachPressMachine`'s
//                       `source`). It cannot live on the owner: `bubble` (events/index.ts) skips
//                       anchors for listener lookup, and `handOverNativeResponder` has no Fabric
//                       handle to hand native for an uncommitted node. So a responder on this tag
//                       could never fire — checked before the design, not after.
// ---------------------------------------------------------------------------------------------
// KNOWN LIMITS, stated rather than left to be found:
//
// 1. EXACTLY ONE CHILD, as RN enforces with `React.Children.only`. A second child lands INSIDE the
//    first (the ordinary `childHost` redirect) rather than throwing. Nothing in RN's surface
//    produces that shape.
// 2. A child REMOVED from a still-mounted TNF leaves its press machine armed until the TNF itself
//    unmounts (`detach` releases whatever `childHost` then holds). Unreachable through the
//    frameworks we drive: Solid's remove-then-reinsert move and Svelte's parking both move the TNF,
//    never its single child, and there is no sibling to reorder it against.
// 3. `style` is NOT cloned, matching RN — its clone list (:342-390) is closed, and a `style` on a
//    TNF stays on a node that never commits. RN's TNF declares no style prop either.
//
// REGISTRATION IS THE HAZARD, not the machine — see `./pressable` for why each adapter entry does a
// bare `import './register';` that the barrel does not re-export. Registered by ALL FIVE adapters
// since 2026-09-09, in the same commit that deleted the five wrappers, which is what makes it safe:
// while a wrapper still built its own Pressable + feedback View, registering would have left every
// TouchableNativeFeedback with two responders. There is no `-managed` twin and none is possible —
// this tag commits no node, so a second spelling would have nothing to name.

import {
  ARIA_ALIAS_KEYS,
  appListenerFor,
  dispatchViewCommand,
  foldAriaProps,
  markPropsDirty,
  Platform,
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
  backgroundProps,
  selectableBackground,
  type INativeFeedbackBackground,
} from '../view/render-touchable-native-feedback';
import {
  accessibleUnlessOptedOut,
  asAccessibilityState,
  attachPressMachine,
  booleanOr,
  detachPressMachine,
  type IPressConfigRefinement,
} from './pressable';
import type { IPressMachineConfig } from '../state/pressable';

export const TOUCHABLE_NATIVE_FEEDBACK_TAG = 'touchable-native-feedback';

// Read once, like `./button`'s: the platform cannot change under a running app.
const IS_ANDROID = Platform.OS === 'android';

// TouchableNativeFeedback.js:349-390, verbatim and in RN's own order. A CLOSED list, not a
// passthrough: RN clones exactly these and nothing else, so a prop it does not name stays behind.
// `accessibilityState`, `accessible`, `focusable` and `nativeID` are cloned too and are computed
// below; `onLayout` and `onAccessibilityAction` are cloned as LISTENERS and forwarded by
// `FORWARDED_LISTENERS`.
const CLONED_PROPS: readonly string[] = [
  'accessibilityHint',
  'accessibilityLanguage',
  'accessibilityLabel',
  'accessibilityRole',
  'accessibilityActions',
  'accessibilityValue',
  'importantForAccessibility',
  'accessibilityViewIsModal',
  'accessibilityLiveRegion',
  'accessibilityElementsHidden',
  'hasTVPreferredFocus',
  'hitSlop',
  'nextFocusDown',
  'nextFocusForward',
  'nextFocusLeft',
  'nextFocusRight',
  'nextFocusUp',
  'testID',
];

// Owner props the cloned payload is COMPUTED from, on top of the verbatim list above. `focusable`
// also derives from the `press` LISTENER, which is not a prop and is handled by
// `onOwnedListenerChange` — a listener flip dirties no payload by itself.
const DERIVED_FROM: readonly string[] = [
  'background',
  'useForeground',
  'accessible',
  'accessibilityState',
  'disabled',
  'focusable',
  'id',
  'nativeID',
];

// Every owner name the child's payload reads. Without it the clone is correct at mount and frozen
// forever after: `markPropsDirty` bubbles UP, so an owner write never reaches the child on its own.
// The aria half comes off the engine's own list rather than a second copy of it.
const SLOT_DERIVED: readonly string[] = [
  ...CLONED_PROPS,
  ...DERIVED_FROM,
  ...ARIA_ALIAS_KEYS,
];

// The two RN clones as EVENTS rather than props (:386-387). Owned, so the app's callback stashes on
// the owner and a trampoline installed on the child reads it at dispatch time — which keeps a fresh
// closure per render free, exactly as `ownedListeners` intends.
//
// Both are Fabric BOOLEAN-GATED events (`.claude/rules/fabric-boolean-event-gates.md`), so the
// trampoline goes in only while the app has one wired: `setBehaviorListener` writes and clears the
// flag with it, and installing eagerly would light the gate on every TNF child in the tree.
const FORWARDED_LISTENERS: readonly string[] = [
  'layout',
  'accessibilityAction',
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

function stringOr(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

// The background dicts our own factories produce, narrowed on the discriminant rather than cast.
// Anything else reads as "not supplied", which is RN's `background === undefined` branch.
function asFeedbackBackground(
  value: unknown,
): INativeFeedbackBackground | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const type = Reflect.get(value, 'type');
  if (type !== 'ThemeAttrAndroid' && type !== 'RippleAndroid') return undefined;
  const attribute = Reflect.get(value, 'attribute');
  const rippleRadius = Reflect.get(value, 'rippleRadius');
  const radius = typeof rippleRadius === 'number' ? rippleRadius : undefined;
  if (type === 'ThemeAttrAndroid') {
    return attribute === 'selectableItemBackgroundBorderless'
      ? { type, attribute, rippleRadius: radius }
      : { type, attribute: 'selectableItemBackground', rippleRadius: radius };
  }
  const color = Reflect.get(value, 'color');
  return {
    type,
    color: typeof color === 'string' ? color : null,
    borderless: Reflect.get(value, 'borderless') === true,
    rippleRadius: radius,
  };
}

// TouchableNativeFeedback.js:280 — `locationX ?? 0`. The bag is raw Fabric payload, so guard.
function hotspotAt(nativeEvent: Record<string, unknown>, key: string): number {
  const value = nativeEvent[key];
  return typeof value === 'number' ? value : 0;
}

/**
 * TNF's own Pressability config, applied to whatever node carries the responder.
 *
 * SHARED WITH `./button`, which is what this file's arrival makes possible. Button's Android arm
 * held a private copy with a comment saying a future `touchable-native-feedback` tag could not
 * reuse it "while the wrappers wrap" — the tag is here now and the responder node is a parameter
 * either way, so the copy is gone.
 *
 * `minPressDuration: 0` is UNCONDITIONAL in RN (:226), not Android-gated: TNF has no feedback
 * machine of its own to hold, and the press machine's 130 ms deactivation floor would only defer
 * `onPressOut` — which on Android leaves `setPressed(false)` ~130 ms late and the ripple lit after
 * the finger is gone. The two view commands ARE Android-gated (:257,:276): the ripple is a drawable
 * Android animates off the view's pressed state, and the JS responder consumes the touch before
 * Android's own pressed handling ever runs, so without them the background is installed and never
 * moves.
 */
export const nativeFeedbackRefinement: IPressConfigRefinement = (
  node,
  config,
): IPressMachineConfig => {
  if (!IS_ANDROID) return { ...config, minPressDuration: 0 };
  const hotspot = (event: ISymbioteEvent): void => {
    dispatchViewCommand(node, 'hotspotUpdate', [
      hotspotAt(event.nativeEvent, 'locationX'),
      hotspotAt(event.nativeEvent, 'locationY'),
    ]);
  };
  return {
    ...config,
    minPressDuration: 0,
    onPressIn(event: ISymbioteEvent): void {
      // RN's order: hotspot first, so the ripple starts where the finger is rather than at centre.
      hotspot(event);
      dispatchViewCommand(node, 'setPressed', [true]);
      config.onPressIn?.(event);
    },
    onPressMove(event: ISymbioteEvent): void {
      hotspot(event);
      // RN drops the app's own onPressMove here; ours forwards it, because on a tag that callback
      // is the app's and iOS already delivers it.
      config.onPressMove?.(event);
    },
    onPressOut(event: ISymbioteEvent): void {
      dispatchViewCommand(node, 'setPressed', [false]);
      config.onPressOut?.(event);
    },
  };
};

/**
 * `cloneElement(element, {…})` as a payload fold: the child's own props first, the owner's clone
 * list over them.
 *
 * OVERWRITING WITH `undefined` IS DELIBERATE and is RN's behaviour, not an accident of the spread.
 * React's `cloneElement` assigns every key of its config, so a TNF with no `accessibilityLabel`
 * clears the child's; `fabricProps` skips undefined values, which reproduces that exactly.
 *
 * Pure, as `IPayloadFold` requires — the owner is read, never written.
 */
function cloneFold(owner: ISymbioteNode, inner: IPayloadFold | undefined) {
  return (
    props: Readonly<Record<string, unknown>>,
  ): Record<string, unknown> => {
    const next: Record<string, unknown> = {
      ...(inner === undefined ? props : inner(props)),
    };
    // The owner's aria props are on the OWNER, so the engine's own fold at `fabricProps` — which
    // reads the node being committed — never sees them. Run it here over the source bag instead of
    // restating any of `:349-390`'s aria half; `hasAriaAlias` is the same sticky gate `fabricProps`
    // uses, and the fold returns its input by identity when there is nothing to do.
    const source = owner.hasAriaAlias
      ? foldAriaProps(owner.props)
      : owner.props;
    for (const key of CLONED_PROPS) next[key] = source[key];

    // :369-372. `onPress` is an OWNED name, so it lives in the stash and never in `props`.
    const disabled = booleanOr(source.disabled);
    next.accessible = accessibleUnlessOptedOut(source);
    next.focusable = resolveTouchableFocusable(
      booleanOr(source.focusable),
      appListenerFor(owner, 'press') !== undefined,
      disabled,
    );
    // :373. RN gives `id` unconditional priority over `nativeID`.
    next.nativeID = stringOr(source.id) ?? stringOr(source.nativeID);
    // :318-323 folded by the engine above, then :324-330: an explicit `disabled` overrides the
    // aria/accessibilityState answer. Same helper every wrapper calls, so both paths agree.
    next.accessibilityState = resolveDisabledAccessibilityState(
      asAccessibilityState(source.accessibilityState),
      disabled,
    );
    // :343-348 + :402. `getBackgroundProp` returns null off Android, so nothing is spread there.
    if (IS_ANDROID) {
      Object.assign(
        next,
        backgroundProps(
          asFeedbackBackground(source.background) ?? selectableBackground(),
          source.useForeground === true,
        ),
      );
    }
    return next;
  };
}

// Not RN's own list: RN drops these by never cloning them, and a lowered tag has no clone to omit
// them from — they would ride into the child's payload as keys no ViewConfig declares. Same strip
// `./pressable`'s fold does for the machine-only half, applied to the owner's bag instead.
//
// (`background` / `useForeground` / `disabled` / `hitSlop` never reach the child's props at all —
// the fold only ever ADDS to the child's own bag — so nothing needs stripping here. Kept as a
// comment rather than an empty constant so the next reader does not go looking for the strip.)

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
  attachPressMachine(child, {
    source: owner,
    refine: nativeFeedbackRefinement,
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
  // First attach has no child yet; a re-attach after the sweep does. See `arm`.
  if (node.childHost !== undefined) arm(node, node.childHost);
}

function detach(node: ISymbioteNode): void {
  const child = node.childHost;
  if (child !== undefined) detachPressMachine(child);
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
  // at createInstance), so the fold owes a run even though nothing was written since.
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
export function registerTouchableNativeFeedbackBehavior(): void {
  const behavior: IHostBehavior = {
    attach,
    detach,
    onChildInserted,
    onOwnedListenerChange,
    // Owned on the OWNER, which is where the app writes them, and read from there by the machine
    // on the child (`attachPressMachine`'s `source`) and by the trampolines above.
    ownedListeners: [...PRESS_LISTENERS, ...FORWARDED_LISTENERS],
    slotDerived: SLOT_DERIVED,
  };
  registerHostBehavior(TOUCHABLE_NATIVE_FEEDBACK_TAG, behavior);
}
