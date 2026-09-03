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
  registerHostBehavior,
  requestCommitFor,
  setBehaviorListener,
  setNodePressed,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import {
  createPressHandlers,
  createPressRuntime,
  disposePressRuntime,
  DEFAULT_DELAY_LONG_PRESS_MS,
  type IPressHost,
  type IPressHandler,
  type IPressMachineConfig,
  type IPressRuntime,
  rippleProps,
  type IPressableAndroidRippleConfig,
  type IRectOffset,
} from '../state/pressable';
import type { IAccessibilityStateValue } from '../accessibility-props';
import {
  buildPressableListeners,
  resolveDisabledAccessibilityState,
} from '../view/render-pressable';

export const PRESSABLE_TAG = 'symbiote-pressable';

interface IBehaviorState {
  readonly runtime: IPressRuntime;
  readonly host: IPressHost;
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

// The props the MACHINE consumes and the host must never see. The wrapper drops them by
// destructuring — they go into `createPressHandlers` / `buildPressableListeners` and are simply
// absent from the object it spreads onto its View. A lowered element has no destructure, so every
// one of them rode into the payload as a key no ViewConfig declares.
const MACHINE_ONLY_KEYS = [
  // Consumed below and replaced by the resolved `nativeBackgroundAndroid` /
  // `nativeForegroundAndroid`; the raw config is not a native prop.
  'android_ripple',
  'disabled',
  'cancelable',
  'delayLongPress',
  'unstable_pressDelay',
  'pressRetentionOffset',
  'delayHoverIn',
  'delayHoverOut',
] as const;

// Narrowed field by field rather than cast: the bag arrives as `unknown` off `node.props`. A local
// twin of the guard each adapter keeps for its own attrs (Vue's `asAccessibilityState`) — not
// hoisted to the shared barrel, because every adapter re-exports that barrel wholesale and a
// narrowing helper is not API anyone should be able to import.
function asAccessibilityState(
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

// Narrowed field by field, same reason as the accessibility guard above: the config arrives as
// `unknown` off `node.props`.
function asRippleConfig(
  value: unknown,
): IPressableAndroidRippleConfig | undefined {
  if (!isRecord(value)) return undefined;
  const config: IPressableAndroidRippleConfig = {};
  if (typeof value.color === 'string') config.color = value.color;
  if (typeof value.borderless === 'boolean')
    config.borderless = value.borderless;
  if (typeof value.radius === 'number') config.radius = value.radius;
  if (typeof value.foreground === 'boolean')
    config.foreground = value.foreground;
  return config;
}

// `disabled` reaches a screen reader ONLY as `accessibilityState.disabled` — it is not a native
// View prop, so the wrapper folds it (`resolveDisabledAccessibilityState`, called by all five) and
// forwards the composite. Lowering dropped that fold: press suppression still worked, because the
// machine reads `node.props.disabled` directly, so the button behaved correctly and announced
// itself as enabled. An accessibility regression with no visual tell and no failing test.
//
// Found by the wrapper-vs-behavior import audit (`.claude/rules/adapter-parity-audit.md`).
function foldPayload(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const resolved = resolveDisabledAccessibilityState(
    asAccessibilityState(props.accessibilityState),
    typeof props.disabled === 'boolean' ? props.disabled : undefined,
  );

  // The Android ripple. Our WRAPPER paints it through a dedicated inner View, mirroring
  // TouchableNativeFeedback — and that reading is what made this look unfixable for a lowered
  // element, which has no child to put it on. RN's own `Pressable` does NOT do that: it spreads
  // `useAndroidRippleForView`'s `viewProps` onto its own View (`Pressable.js:251`), so the ripple
  // background is an ordinary prop of the responder itself and a single node carries it fine.
  //
  // `rippleProps` returns undefined off Android, so this whole branch is inert on iOS.
  //
  // STILL MISSING ON BOTH PATHS, and lowering did not cause it: RN also dispatches
  // `Commands.hotspotUpdate(x, y)` on pressIn/pressMove and `Commands.setPressed` on
  // pressIn/pressOut, which is what makes the ripple originate at the touch point. Neither our
  // wrapper nor this behavior sends them — grep for `hotspotUpdate` returns nothing in the tree.
  const rippleConfig = asRippleConfig(props.android_ripple);
  const ripple =
    rippleConfig !== undefined ? rippleProps(rippleConfig) : undefined;

  const out: Record<string, unknown> = { ...props };
  for (const key of MACHINE_ONLY_KEYS) delete out[key];
  if (ripple !== undefined) Object.assign(out, ripple);
  // Written only when the fold produced something: an unconditional assignment would put an
  // `accessibilityState: undefined` key on every lowered Pressable in the tree, and `fabricProps`
  // skipping undefined is a coincidence to lean on, not a contract to rely on here.
  if (resolved !== undefined) out.accessibilityState = resolved;
  return out;
}

// From the STASH, not from `node.props`. Every name below is in `ownedListeners`, so `routeProp`
// diverts the app's `onPress` away from `node.listeners` (where it would evict the behavior's own
// dispatcher) and into the stash — which makes the stash the only place it exists. Reading
// `node.props` here returns undefined for every callback and every press silently does nothing:
// the behavior runs, the machine runs, and it calls nobody.
function callbackAt(
  node: ISymbioteNode,
  event: string,
): IPressHandler | undefined {
  const value = appListenerFor(node, event);
  return isPressHandler(value) ? value : undefined;
}

// Callbacks come from `callbackAt` (the stash), scalars from `node.props`. The split is not
// cosmetic: `delayLongPress` and `hitSlop` are ordinary props that `fabricProps` drops as unknown
// keys, while `onPress` and friends are OWNED event names that never reach `node.props` at all.
function configFor(node: ISymbioteNode): IPressMachineConfig {
  return {
    onPress: callbackAt(node, 'press'),
    onPressIn: callbackAt(node, 'pressIn'),
    onPressOut: callbackAt(node, 'pressOut'),
    onPressMove: callbackAt(node, 'pressMove'),
    onLongPress: callbackAt(node, 'longPress'),
    delayLongPress: numberOr(
      node.props.delayLongPress,
      DEFAULT_DELAY_LONG_PRESS_MS,
    ),
    unstable_pressDelay: numberOr(node.props.unstable_pressDelay, 0),
    hitSlop: asRectOffset(node.props.hitSlop),
    pressRetentionOffset: asRectOffset(node.props.pressRetentionOffset),
  };
}

// Rebuilding at GESTURE START is the whole reason for the dispatcher indirection, and skipping it
// is a bug that looks like working code. `attach` runs inside `createElement`, before a single
// prop has been routed — `node.props` is literally `{}` there — so a machine built at attach would
// capture no `onPress` at all and every press would silently do nothing. `createPressHandlers`
// destructures its config eagerly, so it cannot be handed a live view either; it has to be re-made
// once the props exist. A gesture is one interaction, so a handful of closures per press is
// invisible — unlike doing it per prop write, which is the cost this whole tier exists to remove.
function rebuild(node: ISymbioteNode, state: IBehaviorState): void {
  const handlers = createPressHandlers(
    configFor(node),
    state.runtime,
    state.host,
  );
  state.isBuilt = true;
  state.listeners = buildPressableListeners(handlers, {
    disabled: node.props.disabled === true ? true : undefined,
    cancelable:
      typeof node.props.cancelable === 'boolean'
        ? node.props.cancelable
        : undefined,
  });
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
]);

function installListeners(node: ISymbioteNode, state: IBehaviorState): void {
  for (const [event, key] of KEY_BY_EVENT) {
    setBehaviorListener(node, event, symbioteEvent =>
      dispatch(node, state, key, [symbioteEvent]),
    );
  }
}

function attach(node: ISymbioteNode): void {
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
    timers,
    listeners: {},
    isBuilt: false,
  };
  states.set(node, state);
  installListeners(node, state);
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

// Idempotent: an adapter entry may be imported more than once in a bundle, and re-registering the
// same tag with an equivalent behavior must not double-install anything.
export function registerPressableBehavior(): void {
  registerHostBehavior(PRESSABLE_TAG, {
    attach,
    detach,
    foldPayload,
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
    ],
  });
}
