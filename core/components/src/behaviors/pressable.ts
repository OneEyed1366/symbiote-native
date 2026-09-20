// The press machine as an ENGINE-NODE behavior, so a pressable can be an intrinsic tag instead of
// a framework component (`.claude/rules/host-primitive-tier.md`, tier 2). Written once; every
// adapter inherits it by registering, and none re-implements it.
//
// The machine itself is unchanged and still shared with the component path — `createPressRuntime`
// / `createPressHandlers` in `../state/pressable`. What is new is only WHERE its lifecycle lives:
// on the engine node rather than in a component instance.
//
// REGISTRATION IS THE HAZARD, not the machine. Metro enables `inlineRequires` in production only,
// moving a `require` to the first place its binding is used as a VALUE, and a barrel's
// `export { X } from './x'` compiles to a lazy getter. A module whose only job is a side effect is
// never named as a value, so re-exporting it means it NEVER RUNS in a release build — dev perfect,
// release silently pressless. Each adapter therefore keeps its own `src/register.ts` calling
// `registerPressableBehavior()`, and its entry does a bare `import './register';` that the barrel
// does NOT re-export. A bare `import './register';` sitting NEXT TO such a re-export does not work
// either: Babel merges the two imports of one specifier and the merged dependency stays lazy.

import {
  appListenerFor,
  dlog,
  propOf,
  registerHostBehavior,
  requestCommitFor,
  setBehaviorListener,
  setNodePressed,
  type IHostBehavior,
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

/**
 * A last look at the machine's config before its handlers are built, for a tag that IS a pressable
 * plus something — TouchableOpacity, whose fade has to run between the machine and the app's own
 * `onPressIn`.
 *
 * Called from `rebuild`, so once per gesture rather than once per mount: it sees the config the
 * props actually hold by the time a finger lands, and anything it captures is discarded with the
 * gesture. Per-node state that must OUTLIVE a gesture belongs on the caller's own WeakMap.
 */
export type IPressConfigRefinement = (
  node: ISymbioteNode,
  config: IPressMachineConfig,
) => IPressMachineConfig;

/**
 * What the machine reads as `disabled`, for a tag whose spelling of it is not the raw prop.
 *
 * There is no resolver by default because RN's Pressable hands Pressability the RAW prop
 * (`Pressable.js:266`) — `aria-disabled` there changes only what is ANNOUNCED. Button is the one
 * primitive that differs: it resolves `disabled ?? aria-disabled ?? accessibilityState.disabled` in
 * the component and passes the ANSWER down as the touchable's own prop (`Button.js:337` -> `:386`),
 * which a single tag has no second node to pass to.
 *
 * Reads the bag and returns the answer; it must never write one back. `resolveButtonDisabled`
 * short-circuits on an authored `disabled`, so a resolved value stored in `node.props.disabled`
 * would answer the NEXT resolution as if the app had written it and the tag could never re-enable.
 */
export type IDisabledResolver = (
  props: Readonly<Record<string, unknown>>,
) => boolean | undefined;

interface IBehaviorState {
  readonly runtime: IPressRuntime;
  readonly host: IPressHost;
  readonly refine: IPressConfigRefinement | undefined;
  readonly disabledOf: IDisabledResolver | undefined;
  // Where the machine READS from, which is not always the node it acts ON. They differ for exactly
  // one shape: a primitive that renders no view of its own and clones onto its single child
  // (`./touchable-native-feedback`). There the props and the app's callbacks are on the OWNER, and
  // the responder — the listeners, the Fabric tag `measure` and the pressed class need — is on the
  // child, because a node with no committed view receives no events (`events/index.ts` skips
  // anchors in `bubble`, and `handOverNativeResponder` has no handle to hand native).
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

// Narrowed field by field rather than cast: the bag arrives as `unknown` off `propOf`. A local
// twin of the guard each adapter keeps for its own attrs (Vue's `asAccessibilityState`) — exported
// to the sibling behaviors that fold the same bag, and deliberately NOT to the shared barrel, which
// every adapter re-exports wholesale: a narrowing helper is not API anyone should be able to import.
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

// THE PAYLOAD FOLD MOVED TO THE ENGINE — `foldPressableProps` in `SymbioteFabricProps.cpp`, and
// its contract is `core/engine/cpp/tests/js/pressable-payload.itest.ts`. It is not re-implemented
// here in any form, which is the point: `disabled` -> `accessibilityState`, `accessible`/`focusable`
// defaulting on, the Android ripple config, and the nine machine-only keys being kept out of the
// payload are all functions of the TAG alone. That is user-agent behavior — RN does it for every
// Pressable in every app — and it belongs beside the tree, like a browser's `<button>`.
//
// It cost a trip: a `payloadFold` marshals the whole bag out and the whole bag back, ~17 us per
// pressable per commit, and a benchmark row carries two.
//
// What is still here is the MACHINE, which is where a browser keeps it too: timers, the responder
// claim, hit-slop retention, and the callbacks into app code.
//
// The one thing that did NOT move with it is `hitSlop`, and that is deliberate — it is a real
// native View prop, so it never was part of the fold.

// RN makes every pressable accessible unless the app opts OUT — `Pressable.js:252`
// (`accessible: accessible !== false`), and the whole Touchable family repeats it verbatim
// (`TouchableOpacity.js:303`, `TouchableHighlight.js:337`). `!== false` rather than `?? true`, so
// only a literal `false` opts out and an explicit `undefined` still reads as accessible.
//
// Nothing in this repo did it until 2026-09-09, so a Pressable reached a screen reader as a plain
// view unless the app wrote the prop. Exported so anything composing this tag can say it too.
export function accessibleUnlessOptedOut(
  props: Readonly<Record<string, unknown>>,
): boolean {
  return props.accessible !== false;
}

// From the STASH, not from the props. Every name below is in `ownedListeners`, so `routeProp`
// diverts the app's `onPress` away from `node.listeners` (where it would evict the behavior's own
// dispatcher) and into the stash — which makes the stash the only place it exists. Reading
// `propOf` here returns undefined for every callback and every press silently does nothing:
// the behavior runs, the machine runs, and it calls nobody.
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
    // Pressability.js:471-474 — `normalizeDelay(authored, 10, DEFAULT_LONG_PRESS_DELAY_MS -
    // delayPressIn)`. The subtraction applies only to the FALLBACK, never to an authored value —
    // it exists so the long-press threshold, timed from the grant that also arms
    // `unstable_pressDelay`, lands at a constant 500ms from touch-down by default, not
    // 500ms + unstable_pressDelay. See `createPressHandlers`'s `handlePressIn` for the other half
    // (the timer must be ARMED at grant, not after the pressDelay fires, or this compensation
    // does nothing).
    delayLongPress: Math.max(
      10,
      numberOr(
        propOf(node, 'delayLongPress'),
        DEFAULT_DELAY_LONG_PRESS_MS - unstablePressDelay,
      ),
    ),
    unstable_pressDelay: unstablePressDelay,
    // RN's Touchables own the deactivation floor in their OWN machine and hand Pressability
    // `minPressDuration: 0` (TouchableOpacity.js:195). While they were wrappers they passed it as
    // an internal input; on the tag there is nowhere else to say it, so the floor has to be a
    // readable prop or every Touchable holds its fade for the machine's 130 ms default.
    minPressDuration: numberOr(
      propOf(node, 'minPressDuration'),
      DEFAULT_MIN_PRESS_DURATION_MS,
    ),
    hitSlop: asRectOffset(propOf(node, 'hitSlop')),
    pressRetentionOffset: asRectOffset(propOf(node, 'pressRetentionOffset')),
    // Pressable.js's own name is `android_disableSound`; every composed touchable (Highlight,
    // NativeFeedback, WithoutFeedback, Button) instead forwards vendor's `touchSoundDisabled` to
    // this same config field (`TouchableHighlight.js:205`, `TouchableWithoutFeedback.js:199`,
    // `TouchableNativeFeedback.js:228`). `node` here is whichever tag AUTHORS the prop — itself for
    // a plain pressable/highlight/button, the owner for a clone-onto-child touchable, since
    // `configFor` is always called with that source — so reading both names off it resolves
    // correctly for every composition without a per-tag override.
    android_disableSound:
      booleanOr(propOf(node, 'android_disableSound')) ??
      booleanOr(propOf(node, 'touchSoundDisabled')),
  };
}

// Rebuilding at GESTURE START is the whole reason for the dispatcher indirection, and skipping it
// is a bug that looks like working code. `attach` runs inside `createElement`, before a single
// prop has been routed — the node holds nothing at all there — so a machine built at attach would
// capture no `onPress` at all and every press would silently do nothing. `createPressHandlers`
// destructures its config eagerly, so it cannot be handed a live view either; it has to be re-made
// once the props exist. A gesture is one interaction, so a handful of closures per press is
// invisible — unlike doing it per prop write, which is the cost this whole tier exists to remove.
function rebuild(node: ISymbioteNode, state: IBehaviorState): void {
  // `state.source` for everything READ, `node` for the refinement, which acts on the responder
  // (dispatching a view command needs the committed node, not the one holding the props).
  const source = state.source;
  const base = configFor(source);
  const handlers = createPressHandlers(
    state.refine === undefined ? base : state.refine(node, base),
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
    cancelable: resolveCancelable(source),
    blockNativeResponder: propOf(source, 'blockNativeResponder') === true,
  });
}

// Pressable is the only member of the family with a `cancelable` prop of its own (`Pressable.js:41`).
// TouchableOpacity/TouchableHighlight/TouchableNativeFeedback instead expose `rejectResponderTermination`
// and derive `cancelable: !this.props.rejectResponderTermination` internally
// (`TouchableOpacity.js:186`, `TouchableHighlight.js:194`, `TouchableNativeFeedback.js:217`) — every
// composed touchable shares this `rebuild()`, so without this the authored name never reached the
// machine and every Touchable silently kept the RN native default (yield the responder) regardless of
// what the app asked for. An explicit `cancelable` still wins, matching Pressable's own precedence.
function resolveCancelable(source: ISymbioteNode): boolean | undefined {
  const cancelable = propOf(source, 'cancelable');
  if (typeof cancelable === 'boolean') return cancelable;
  const reject = propOf(source, 'rejectResponderTermination');
  return typeof reject === 'boolean' ? !reject : undefined;
}

// WHICHEVER EVENT OPENS THE GESTURE REBUILDS, and pinning that to one name was a real bug.
// `onStartShouldSetResponder` looks like the opener and is not: `core/engine/src/events/index.ts`
// bubbles PRESS_IN and only THEN calls `negotiateResponder`, so `pressIn` arrives FIRST on every
// gesture. Rebuilding only on the responder claim therefore handed the first `pressIn` an empty
// listener bag — the press-in half of every press was dropped, the pressed style never reached
// Fabric, and `onPress` still fired because by then the machine existed. That is exactly the
// device report: the callback works, the button does not light up.
//
// So the trigger is a FLAG, not a name: build if this gesture has not built yet, and clear it when
// the gesture ends. Order-independent, and it survives the engine reordering its own events.
//
// A key `buildPressableListeners` omitted — every one of them when `disabled` is true — resolves to
// undefined here and the dispatcher returns undefined, which is what an absent listener would do.
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

// Installed straight into the listener slot rather than through `routeProp`: the behavior OWNS
// these names, and `setEventListener` diverts an owned name into the app stash — routing its own
// dispatcher through there would stash it and leave the slot empty.
//
// The engine event names, not the `onX` prop spellings. `buildPressableListeners` speaks the prop
// spelling, so the two are mapped here rather than guessed at either end.
const KEY_BY_EVENT: ReadonlyMap<string, string> = new Map([
  ['press', 'onPress'],
  ['pressIn', 'onPressIn'],
  ['pressOut', 'onPressOut'],
  ['startShouldSetResponder', 'onStartShouldSetResponder'],
  ['responderMove', 'onResponderMove'],
  ['responderTerminationRequest', 'onResponderTerminationRequest'],
  ['responderGrant', 'onResponderGrant'],
]);

function installListeners(node: ISymbioteNode, state: IBehaviorState): void {
  for (const [event, key] of KEY_BY_EVENT) {
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

/**
 * The machine on `node`, reading its props and the app's callbacks off `options.source` when that
 * is a different node.
 *
 * Exported for a behavior whose responder is not its own node — `./touchable-native-feedback`,
 * whose tag commits nothing and adopts the app's single child as the responder. Every other caller
 * goes through `createPressBehavior`, where source and node are the same.
 *
 * Re-callable on the same node: a second call replaces the state and the dispatchers, which is what
 * a re-arm after `detachPressMachine` needs.
 */
export function attachPressMachine(
  node: ISymbioteNode,
  options: {
    readonly refine?: IPressConfigRefinement;
    readonly disabledOf?: IDisabledResolver;
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
      // Dirtying is not publishing. A press arrives from a native event, outside every renderer
      // mutation path, so nothing schedules a commit — `native-events.ts` requests none, and no
      // adapter does either. `setNodeHidden`'s React twin never hit this because the reconciler is
      // already in its commit phase when it calls.
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
  // The machine's own teardown, which every wrapper calls from its destroy hook. Not load-bearing
  // here and no test can make it so: `host.schedule` puts every timer the machine arms into
  // `state.timers` — the 130ms floor's deferred `pressOut` included — so the loop below already
  // cancels them. Kept as the contract, and for a timer armed by some future route.
  disposePressRuntime(state.runtime);
  for (const id of state.timers) clearTimeout(id);
  state.timers.clear();
  states.delete(node);
  dlog('pressable behavior detached');
}

/**
 * The press machine as behavior parts, so a tag that is a pressable PLUS something can compose it
 * instead of re-implementing it.
 *
 * Spread into the caller's own behavior and wrap `attach`/`detach` around these — the touchable
 * family needs a per-node Animated value opened before the machine and closed after it. The
 * WeakMap holding the machine's own state is keyed by node, so one node may hold exactly one of
 * these; a tag composing it therefore must not also register the plain `pressable` behavior.
 */
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
