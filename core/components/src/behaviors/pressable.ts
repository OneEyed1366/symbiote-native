// The press machine as an ENGINE-NODE behavior, so a pressable can be an intrinsic tag instead of
// a framework component. Written once; every adapter inherits it by registering, none re-implements
// it. The machine itself is unchanged and still shared with the component path.

// Registration, not the machine, is the hazard: Metro's inlineRequires makes a barrel re-export of
// a side-effect-only module never run in a release build. Each adapter keeps its own
// `src/register.ts` calling registerPressableBehavior(), reached only by a bare side-effect import.

import {
  appListenerFor,
  dispatchViewCommand,
  dlog,
  Platform,
  propOf,
  registerHostBehavior,
  requestCommitFor,
  setBehaviorListener,
  setNodePressed,
  type IHostBehavior,
  type ISymbioteEvent,
  type ISymbioteNode,
  propsOf,
} from '@symbiote-native/engine';
import {
  createPressHandlers,
  createPressRuntime,
  disposePressRuntime,
  DEFAULT_DELAY_LONG_PRESS_MS,
  DEFAULT_MIN_PRESS_DURATION_MS,
  type IPressHost,
  type IPressHandler,
  type IPressMachineConfig,
  type IPressRuntime,
  type IRectOffset,
} from '../state/pressable';
import type { IAccessibilityStateValue } from '../accessibility-props';
import { buildPressableListeners } from '../view/render-pressable';

export const PRESSABLE_TAG = 'pressable';

// A last look at the machine's config before its handlers are built, for a tag that IS a
// pressable plus something (TouchableOpacity's fade running between the machine and onPressIn).

// Called from `rebuild`, once per gesture, not per mount — anything it captures is discarded with
// the gesture; state that must OUTLIVE a gesture belongs on the caller's own WeakMap.
export type IPressConfigRefinement = (
  node: ISymbioteNode,
  config: IPressMachineConfig,
) => IPressMachineConfig;

// What the machine reads as `disabled`, for a tag whose spelling isn't the raw prop. No resolver
// by default: RN's Pressable hands Pressability the raw prop. Button differs, resolving
// disabled/aria-disabled/accessibilityState itself.

// Reads the bag, never writes one back: a resolved value stored in node.props.disabled would
// answer the NEXT resolution as if the app wrote it, and the tag could never re-enable.
export type IDisabledResolver = (
  props: Readonly<Record<string, unknown>>,
) => boolean | undefined;

export type ICancelableResolver = (
  source: ISymbioteNode,
) => boolean | undefined;

interface IBehaviorState {
  readonly runtime: IPressRuntime;
  readonly host: IPressHost;
  readonly refine: IPressConfigRefinement | undefined;
  readonly disabledOf: IDisabledResolver | undefined;
  // A tag whose `cancelable` is not the family's rule (TextInput's is platform-split).
  readonly cancelableOf: ICancelableResolver | undefined;
  // Where the machine READS from, not always the node it acts ON: a primitive with no view of its
  // own that clones onto its single child (touchable-native-feedback) has props on the OWNER but
  // the responder on the child, since a node with no committed view receives no events.
  readonly source: ISymbioteNode;
  readonly timers: Set<ReturnType<typeof setTimeout>>;
  // Replaced wholesale at each gesture start; see `rebuild`.
  listeners: Record<string, unknown>;
  // Whether `listeners` holds a machine built for the gesture in progress. Reset when the gesture
  // ends, so the next one rebuilds from whatever the props are by then.
  isBuilt: boolean;
}

const states = new WeakMap<ISymbioteNode, IBehaviorState>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// The bag arrives as `unknown` off `node.props`; every RN default below is written against
// `boolean | undefined`. Exported to the sibling behaviors folding the same bag, and deliberately
// NOT to the shared barrel — same reasoning as `asAccessibilityState`.
export function booleanOr(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

// A scalar offset or the per-edge object; anything else reads as "no offset", which the machine
// turns into RN's defaults. Same narrowing the component path does — kept here rather than shared
// because the component's version narrows Vue attrs, and this one narrows engine props.
function asRectOffset(value: unknown): IRectOffset | undefined {
  if (typeof value === 'number') return value;
  if (!isRecord(value)) return undefined;
  const rect: { top?: number; left?: number; bottom?: number; right?: number } =
    {};
  if (typeof value.top === 'number') rect.top = value.top;
  if (typeof value.left === 'number') rect.left = value.left;
  if (typeof value.bottom === 'number') rect.bottom = value.bottom;
  if (typeof value.right === 'number') rect.right = value.right;
  return rect;
}

// A predicate rather than a bare `typeof`: `typeof x === 'function'` narrows to `Function`, which
// carries no call signature and cannot satisfy IPressHandler. Guard, never cast. Also used for the
// listener bag, whose values are `unknown` for the same reason.
function isPressHandler(value: unknown): value is IPressHandler {
  return typeof value === 'function';
}

// Narrowed field by field rather than cast: the bag arrives as `unknown` off propOf. Exported to
// sibling behaviors folding the same bag, deliberately NOT to the shared barrel — a narrowing
// helper isn't API anyone should import.
export function asAccessibilityState(
  value: unknown,
): IAccessibilityStateValue | undefined {
  if (!isRecord(value)) return undefined;
  const state: IAccessibilityStateValue = {};
  if (typeof value.disabled === 'boolean') state.disabled = value.disabled;
  if (typeof value.selected === 'boolean') state.selected = value.selected;
  if (value.checked === 'mixed' || typeof value.checked === 'boolean')
    state.checked = value.checked;
  if (typeof value.busy === 'boolean') state.busy = value.busy;
  if (typeof value.expanded === 'boolean') state.expanded = value.expanded;
  return state;
}

// The payload fold moved to the engine (foldPressableProps in SymbioteFabricProps.cpp), not
// re-implemented here: disabled -> accessibilityState, accessible/focusable defaulting on, the
// ripple config and the machine-only keys are all functions of the TAG alone, user-agent behavior.

// What's still here is the MACHINE: timers, the responder claim, hit-slop retention, callbacks
// into app code. `hitSlop` did NOT move with the fold — it's a real native View prop.

// RN makes every pressable accessible unless the app opts OUT (`accessible !== false`), and the
// whole Touchable family repeats it. `!== false` not `?? true`, so only a literal `false` opts out.
export function accessibleUnlessOptedOut(
  props: Readonly<Record<string, unknown>>,
): boolean {
  return props.accessible !== false;
}

// From the STASH, not the props: every name below is in ownedListeners, so routeProp diverts the
// app's onPress away from node.listeners into the stash. Reading propOf here would return
// undefined for every callback and every press would silently call nobody.
function callbackAt(
  node: ISymbioteNode,
  event: string,
): IPressHandler | undefined {
  const value = appListenerFor(node, event);
  return isPressHandler(value) ? value : undefined;
}

// Callbacks come from `callbackAt` (the stash), scalars from `propOf`. The split is not
// cosmetic: `delayLongPress` and `hitSlop` are ordinary props that `fabricProps` drops as unknown
// keys, while `onPress` and friends are OWNED event names that never reach the props at all.
function configFor(node: ISymbioteNode): IPressMachineConfig {
  const unstablePressDelay = numberOr(propOf(node, 'unstable_pressDelay'), 0);
  return {
    onPress: callbackAt(node, 'press'),
    onPressIn: callbackAt(node, 'pressIn'),
    onPressOut: callbackAt(node, 'pressOut'),
    onPressMove: callbackAt(node, 'pressMove'),
    onLongPress: callbackAt(node, 'longPress'),
    // The subtraction applies only to the FALLBACK, never an authored value — it keeps the
    // long-press threshold at a constant 500ms from touch-down by default, not
    // 500ms + unstable_pressDelay (see createPressHandlers.handlePressIn for the other half).
    delayLongPress: Math.max(
      10,
      numberOr(
        propOf(node, 'delayLongPress'),
        DEFAULT_DELAY_LONG_PRESS_MS - unstablePressDelay,
      ),
    ),
    unstable_pressDelay: unstablePressDelay,
    // RN's Touchables own the deactivation floor in their own machine, handing Pressability
    // `minPressDuration: 0`. On the tag there's nowhere else to say it, so it's a readable prop.
    minPressDuration: numberOr(
      propOf(node, 'minPressDuration'),
      DEFAULT_MIN_PRESS_DURATION_MS,
    ),
    hitSlop: asRectOffset(propOf(node, 'hitSlop')),
    pressRetentionOffset: asRectOffset(propOf(node, 'pressRetentionOffset')),
    // Pressable's own name is `android_disableSound`; every composed touchable instead forwards
    // `touchSoundDisabled` to this same field. `node` here is whichever tag AUTHORS the prop, so
    // reading both names resolves correctly for every composition without a per-tag override.
    android_disableSound:
      booleanOr(propOf(node, 'android_disableSound')) ??
      booleanOr(propOf(node, 'touchSoundDisabled')),
  };
}

// Read once: the platform cannot change under a running app.
const IS_ANDROID = Platform.OS === 'android';

// useAndroidRippleForView.js:57 — a ripple exists only when color, borderless or radius is set.
function hasAndroidRipple(config: unknown): boolean {
  if (typeof config !== 'object' || config === null) return false;
  return (
    Reflect.get(config, 'color') != null ||
    Reflect.get(config, 'borderless') != null ||
    Reflect.get(config, 'radius') != null
  );
}

// `locationX ?? 0` (TouchableNativeFeedback.js:280, useAndroidRippleForView.js:83). The bag is raw
// Fabric payload, so guard.
function hotspotAt(nativeEvent: Record<string, unknown>, key: string): number {
  const value = nativeEvent[key];
  return typeof value === 'number' ? value : 0;
}

// The Android ripple's three view commands around the app's callbacks. The JS responder takes
// the touch before Android's own pressed handling, so without them the ripple never animates.
export function withNativeFeedbackCommands(
  node: ISymbioteNode,
  config: IPressMachineConfig,
): IPressMachineConfig {
  const hotspot = (event: ISymbioteEvent): void => {
    dispatchViewCommand(node, 'hotspotUpdate', [
      hotspotAt(event.nativeEvent, 'locationX'),
      hotspotAt(event.nativeEvent, 'locationY'),
    ]);
  };
  return {
    ...config,
    onPressIn(event: ISymbioteEvent): void {
      hotspot(event);
      dispatchViewCommand(node, 'setPressed', [true]);
      config.onPressIn?.(event);
    },
    onPressMove(event: ISymbioteEvent): void {
      hotspot(event);
      config.onPressMove?.(event);
    },
    onPressOut(event: ISymbioteEvent): void {
      dispatchViewCommand(node, 'setPressed', [false]);
      config.onPressOut?.(event);
    },
  };
}

// Rebuilding at GESTURE START is the whole reason for the dispatcher indirection: `attach` runs
// inside createElement before a single prop is routed, so a machine built at attach would capture
// no onPress at all. A gesture is one interaction, so a handful of closures per press is invisible.
function rebuild(node: ISymbioteNode, state: IBehaviorState): void {
  // `state.source` for everything READ, `node` for the refinement, which acts on the responder
  // (dispatching a view command needs the committed node, not the one holding the props).
  const source = state.source;
  const base = configFor(source);
  const refined = state.refine === undefined ? base : state.refine(node, base);
  const handlers = createPressHandlers(
    IS_ANDROID && hasAndroidRipple(propOf(source, 'android_ripple'))
      ? withNativeFeedbackCommands(node, refined)
      : refined,
    state.runtime,
    state.host,
  );
  state.isBuilt = true;
  // Re-read every gesture, so a tag whose resolver looks past `disabled` — `./button`, at
  // `aria-disabled` — re-enables on the next touch instead of latching at its first answer.
  const sourceProps = propsOf(source);
  const disabled: unknown =
    state.disabledOf === undefined
      ? sourceProps.disabled
      : state.disabledOf(sourceProps);
  state.listeners = buildPressableListeners(handlers, {
    disabled: disabled === true ? true : undefined,
    cancelable: (state.cancelableOf ?? resolveCancelable)(source),
    blockNativeResponder: propOf(source, 'blockNativeResponder') === true,
  });
}

// Pressable is the only family member with its own `cancelable` prop; the Touchables instead
// expose `rejectResponderTermination` and derive cancelable internally. Without this the authored
// name never reaches the machine. An explicit `cancelable` still wins, matching Pressable's rule.
function resolveCancelable(source: ISymbioteNode): boolean | undefined {
  const cancelable = propOf(source, 'cancelable');
  if (typeof cancelable === 'boolean') return cancelable;
  const reject = propOf(source, 'rejectResponderTermination');
  return typeof reject === 'boolean' ? !reject : undefined;
}

// WHICHEVER EVENT OPENS THE GESTURE REBUILDS: `onStartShouldSetResponder` looks like the opener
// and isn't, since the engine bubbles PRESS_IN and only then negotiates the responder, so
// `pressIn` arrives first. Rebuilding only on the responder claim handed it an empty listener bag.

// The trigger is a FLAG, not a name: build if this gesture hasn't built yet, clear on gesture end
// — order-independent, survives the engine reordering its own events.
const GESTURE_END_KEYS: ReadonlySet<string> = new Set([
  'onPressOut',
  'onResponderTerminationRequest',
]);

function dispatch(
  node: ISymbioteNode,
  state: IBehaviorState,
  key: string,
  args: readonly unknown[],
): unknown {
  if (!state.isBuilt) rebuild(node, state);
  const listener = state.listeners[key];
  const result = isPressHandler(listener)
    ? Reflect.apply(listener, undefined, args)
    : undefined;
  // AFTER the handler, not before: `handlePressOut` is what settles the machine, and clearing the
  // flag first would let a re-entrant dispatch rebuild mid-gesture.
  if (GESTURE_END_KEYS.has(key)) state.isBuilt = false;
  return result;
}

// Installed straight into the listener slot, not through routeProp: the behavior OWNS these
// names, and setEventListener diverts an owned name into the app stash — routing the dispatcher
// through there would stash it and leave the slot empty.

// Engine event name -> the app-facing callback key its dispatcher routes to. An array of pairs
// rather than a Map: installListeners runs once per node carrying a press machine, and a `for…of`
// over a Map allocates a fresh pair per entry where these tuples already exist.

// NOT the same list as createPressBehavior's ownedListeners — that's every name the machine takes
// as an INPUT, this is only the names it installs a dispatcher for.
const EVENT_KEY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['press', 'onPress'],
  ['pressIn', 'onPressIn'],
  ['pressOut', 'onPressOut'],
  ['startShouldSetResponder', 'onStartShouldSetResponder'],
  ['responderMove', 'onResponderMove'],
  ['responderTerminationRequest', 'onResponderTerminationRequest'],
  ['responderGrant', 'onResponderGrant'],
];

function installListeners(node: ISymbioteNode, state: IBehaviorState): void {
  for (const [event, key] of EVENT_KEY_PAIRS) {
    setBehaviorListener(node, event, symbioteEvent =>
      dispatch(node, state, key, [symbioteEvent]),
    );
  }
}

function attachWith(
  refine: IPressConfigRefinement | undefined,
  disabledOf: IDisabledResolver | undefined,
): (node: ISymbioteNode) => void {
  return node => attach(node, { refine, disabledOf });
}

// The machine on `node`, reading props and callbacks off `options.source` when different.
// Exported for touchable-native-feedback, whose tag commits nothing and adopts the app's single
// child as the responder; every other caller goes through createPressBehavior where they're equal.

// Re-callable on the same node: a second call replaces the state and dispatchers, which is what
// re-arming after detachPressMachine needs.
export function attachPressMachine(
  node: ISymbioteNode,
  options: {
    readonly refine?: IPressConfigRefinement;
    readonly disabledOf?: IDisabledResolver;
    readonly cancelableOf?: ICancelableResolver;
    readonly source?: ISymbioteNode;
  } = {},
): void {
  attach(node, options);
}

function attach(
  node: ISymbioteNode,
  options: {
    readonly refine?: IPressConfigRefinement;
    readonly disabledOf?: IDisabledResolver;
    readonly cancelableOf?: ICancelableResolver;
    readonly source?: ISymbioteNode;
  },
): void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const runtime = createPressRuntime();
  const host: IPressHost = {
    // The whole reason this tier is possible: the pressed state resolves BELOW the framework,
    // through the style registry's `:active` variant, and never crosses into it.
    setPressed: pressed => {
      setNodePressed(node, pressed);
      // Dirtying is not publishing: a press arrives outside every renderer mutation path, so
      // nothing else schedules a commit.
      requestCommitFor(node);
    },
    // `measure` needs a committed Fabric tag, which a node has by the time a human can touch it.
    // Returning undefined before then makes the machine fall back to its radius test rather than
    // throwing, which is the behaviour the component path already relies on.
    getMeasureFn: () => callback => node.measure(callback),
    // Tracked so `detach` can cancel them. An un-cancelled long-press timer outlives the tree that
    // owned it, and `removeChild` visits only a subtree ROOT — a pressable is normally nested.
    schedule: (callback, ms) => {
      const id = setTimeout(() => {
        timers.delete(id);
        callback();
      }, ms);
      timers.add(id);
      return () => {
        clearTimeout(id);
        timers.delete(id);
      };
    },
    now: Date.now,
  };
  const state: IBehaviorState = {
    runtime,
    host,
    refine: options.refine,
    disabledOf: options.disabledOf,
    cancelableOf: options.cancelableOf,
    source: options.source ?? node,
    timers,
    listeners: {},
    isBuilt: false,
  };
  states.set(node, state);
  installListeners(node, state);
}

/** See `attachPressMachine`: the same teardown `createPressBehavior` registers as its `detach`. */
export function detachPressMachine(node: ISymbioteNode): void {
  detach(node);
}

function detach(node: ISymbioteNode): void {
  const state = states.get(node);
  if (state === undefined) return;
  // The machine's own teardown. Not load-bearing here: host.schedule puts every timer the machine
  // arms into state.timers, so the loop below already cancels them — kept as the contract.
  disposePressRuntime(state.runtime);
  for (const id of state.timers) clearTimeout(id);
  state.timers.clear();
  states.delete(node);
  dlog('pressable behavior detached');
}

// The press machine as behavior parts, so a tag that is a pressable PLUS something can compose
// it instead of re-implementing it — the touchable family wraps attach/detach for its own
// per-node Animated value. One node may hold exactly one of these; don't also register `pressable`.
export function createPressBehavior(
  refine?: IPressConfigRefinement,
  disabledOf?: IDisabledResolver,
): Pick<IHostBehavior, 'attach' | 'detach' | 'ownedListeners'> {
  return {
    attach: attachWith(refine, disabledOf),
    detach,
    // Every name the machine needs as an INPUT. The responder pair is not optional — it is how a
    // gesture starts at all, and `RESPONDER_EVENTS` makes those listeners on any node regardless
    // of ViewConfig, so they collide exactly like `press` does.
    ownedListeners: [
      'press',
      'pressIn',
      'pressOut',
      'pressMove',
      'longPress',
      'startShouldSetResponder',
      'responderMove',
      'responderTerminationRequest',
      'responderGrant',
    ],
  };
}

// Idempotent: an adapter entry may be imported more than once in a bundle, and re-registering the
// same tag with an equivalent behavior must not double-install anything.
export function registerPressableBehavior(): void {
  registerHostBehavior(PRESSABLE_TAG, createPressBehavior());
}
