// TouchableOpacity as an ENGINE-NODE behavior, so it can be an intrinsic tag instead of a
// framework component (`.claude/rules/host-primitive-tier.md`, tier 2).
//
// ONE NODE, and that is a correction rather than a shortcut. Every adapter's wrapper builds two —
// a `pressable` holding a faded `view` — and RN builds one: `TouchableOpacity.js:302` renders a
// single `<Animated.View>` carrying the responder handlers AND
// `style={[props.style, {opacity: anim}]}`. The two-node shape is copied from
// TouchableNativeFeedback, which genuinely does clone onto a child; the same misreading is on
// record for `android_ripple` (`.claude/rules/adapter-parity-audit.md`). So the tag collapses the
// pair and lands on RN's own tree.
//
// WHAT IS SHARED AND WHAT IS NEW. The press machine is `./pressable`'s, composed through
// `createPressBehavior` — one node may hold exactly one press machine, so this tag must not also
// register the plain `pressable` behavior. The press-scheduling half (delayPressIn defer,
// flush-on-early-release, the minPressDuration hold) is `../state/touchable`, unchanged and still
// shared with the wrappers. New here is only WHERE the fade lives: on the engine node, through
// `setAnimatedBehaviorStyle`, instead of in a component's own Animated wiring.
//
// REGISTRATION IS THE HAZARD, not the machine — see `./pressable` for why each adapter's entry
// does a bare `import './register';` that the barrel does not re-export.
//
// TODO(rn-parity, low priority): `TouchableOpacity.js:197-220` gates the active/inactive opacity
// fade on `onFocus`/`onBlur` too (TV remote focus fires the same fade `onPress` triggers). Neither
// name is wired into the feedback machine here; they pass through as ordinary, un-intercepted
// event props. Deliberately not implemented — dead on every device this project targets (no tvOS
// build, no example app; iOS/Android are the only targets). Audit skill, "Found, NOT fixed: TV
// (Platform.isTV) focus/blur feedback on TouchableOpacity/Highlight".

import {
  AnimatedMock,
  AnimatedValue,
  Easing,
  Platform,
  dlog,
  getExplicitStyle,
  markPropsDirty,
  registerHostBehavior,
  requestCommitFor,
  setAnimatedBehaviorStyle,
  setProp,
  timing,
  type IHostBehavior,
  type ISymbioteEvent,
  type ISymbioteNode,
  propOf,
  propsOf,
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
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  DEFAULT_ACTIVE_OPACITY,
  OPACITY_ACTIVE_DURATION_MS,
  OPACITY_ACTIVE_GRANT_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  RESTING_OPACITY,
  restingOpacityFromStyle,
  TOUCHABLE_MIN_PRESS_DURATION_MS,
  type ITouchableFeedbackRuntime,
} from '../state/touchable';

export const TOUCHABLE_OPACITY_TAG = 'touchable-opacity';

interface IFeedbackState {
  // One value per mount, held by identity: the graph's bookkeeping is keyed on the instance.
  readonly opacity: AnimatedValue;
  readonly runtime: ITouchableFeedbackRuntime;
  // Tracked so `detach` can cancel them — a deferred press-out outlives the tree that armed it.
  readonly timers: Set<ReturnType<typeof setTimeout>>;
  // What the last commit settled at. `undefined` until the first, because RN re-settles on UPDATE
  // only (componentDidUpdate) and firing at mount would animate over the value just seeded.
  settled: { disabled: unknown; resting: number } | undefined;
  // Whether the animated layer is registered on the node yet, see `ensureLayer`
  isBound: boolean;
}

const states = new WeakMap<ISymbioteNode, IFeedbackState>();

// `modules/animated`'s barrel swaps the whole driver namespace for the mock when the host reports
// reduced motion; the one driver used here is swapped on the same flag.
const startTiming = Platform.isDisableAnimations ? AnimatedMock.timing : timing;

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// From `parts.explicitStyle`, never `node.props.style`. A fade frame lands as `setNativeProps`,
// which merges its partial onto `node.props.style` in place — so reading the published slot would
// hand the resting-opacity math the fade's own output and `afterCommit` would chase itself.
//
// It therefore sees the AUTHOR's style and not a class-derived `opacity`, which is exactly RN's
// scope: `_getChildStyleOpacityWithDefault` reads `this.props.style` and nothing else.
function restingOpacityOf(node: ISymbioteNode): number {
  return restingOpacityFromStyle(getExplicitStyle(node));
}

// Registered on FIRST FADE, not at attach: the leaf costs 9.8 us and 5.9 KB per node
// (`touchable-attach-cost.itest.ts`) and a list nobody presses pays it for a value that never moves
function ensureLayer(node: ISymbioteNode, state: IFeedbackState): void {
  if (state.isBound) return;
  state.isBound = true;
  setAnimatedBehaviorStyle(node, { opacity: state.opacity });
}

function fadeTo(
  node: ISymbioteNode,
  state: IFeedbackState,
  toValue: number,
  ms: number,
): void {
  ensureLayer(node, state);
  dlog(`touchable-opacity opacity -> ${toValue} over ${ms}ms`);
  // useNativeDriver is RN's own (TouchableOpacity.js:242): opacity is natively drivable, so the
  // fade survives a busy JS thread, which is the whole point of press feedback.
  startTiming(state.opacity, {
    toValue,
    duration: ms,
    easing: Easing.inOut(Easing.quad),
    useNativeDriver: true,
  }).start();
}

// Runs once per GESTURE (see IPressConfigRefinement), so the config it reads is whatever the props
// hold when a finger lands, and the handlers it builds are discarded with the gesture. The runtime
// that must outlive one — an in-flight delayPressIn timer, the activation clock — is on the node.
const refine: IPressConfigRefinement = (node, config) => {
  const state = states.get(node);
  if (state === undefined) return config;
  const resting = restingOpacityOf(node);
  const activeOpacity = numberOr(
    propOf(node, 'activeOpacity'),
    DEFAULT_ACTIVE_OPACITY,
  );
  const handlers = createTouchableFeedbackHandlers(
    {
      delayPressIn: numberOr(propOf(node, 'delayPressIn'), 0),
      delayPressOut: numberOr(propOf(node, 'delayPressOut'), 0),
      // Read raw rather than off `config`, which has already defaulted the absent case to the press
      // machine's own 130 ms — a floor RN's Touchables never see (TOUCHABLE_MIN_PRESS_DURATION_MS).
      minPressDuration: numberOr(
        propOf(node, 'minPressDuration'),
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
        // TouchableOpacity.js:215-220 picks the duration from WHERE the press-in came from: a
        // plain grant fades instantly, a drift-back-in arrives as `responderMove` and eases
        const duration =
          event.type === 'responderMove'
            ? OPACITY_ACTIVE_DURATION_MS
            : OPACITY_ACTIVE_GRANT_DURATION_MS;
        fadeTo(node, state, activeOpacity, duration);
        config.onPressIn?.(event);
      },
      deactivate(event: ISymbioteEvent): void {
        fadeTo(node, state, resting, OPACITY_INACTIVE_DURATION_MS);
        config.onPressOut?.(event);
      },
    },
  );
  return {
    ...config,
    // RN hands Pressability 0 (TouchableOpacity.js:195): the deactivation floor belongs to the
    // feedback machine above, and a second one holds the fade for the press machine's default.
    minPressDuration: 0,
    onPressIn: handlers.handlePressIn,
    onPressOut: handlers.handlePressOut,
  };
};

// TouchableOpacity.js:186-189 — `disabled ?? aria-disabled ?? accessibilityState.disabled`, the
// same three-way answer Button resolves, just never wired to this tag's OWN registration before.
// Without it, a caller who sets only `accessibilityState={{disabled: true}}` (no `disabled` prop)
// gets the greyed-out RN look but a press that still fires here — RN suppresses it.
const touchableOpacityDisabled: IDisabledResolver = props =>
  resolveButtonDisabled(
    booleanOr(props.disabled),
    booleanOr(props['aria-disabled']),
    asAccessibilityState(props.accessibilityState),
  );

/**
 * The behavior as PARTS, so a tag that is a TouchableOpacity plus something — `button`, which RN
 * builds as exactly that (Button.js:283) — composes the fade instead of re-implementing it.
 *
 * Safe to hand to two tags: every piece of runtime is keyed by NODE (`states`), and `press` is
 * itself already shared that way.
 */
export function createTouchableOpacityBehavior(
  disabledOf?: IDisabledResolver,
): IHostBehavior {
  // Its own machine rather than the module-level `press`, so a composing tag can say what
  // `disabled` MEANS to it — the answer feeds the machine, not a payload: the props half of that
  // question is `foldPressableProps` in `SymbioteFabricProps.cpp` and reads the authored bag.
  const machine = createPressBehavior(refine, disabledOf);
  return {
    ...machine,
    attach(node: ISymbioteNode): void {
      const state: IFeedbackState = {
        opacity: new AnimatedValue(RESTING_OPACITY),
        runtime: createTouchableFeedbackRuntime(),
        timers: new Set(),
        settled: undefined,
        isBound: false,
      };
      states.set(node, state);
      // The half of the binding that CANNOT wait for the first press: a view Fabric flattens
      // mid-gesture loses the tag the responder lands on. The leaf follows in `ensureLayer`
      setProp(node, 'collapsable', false);
      machine.attach(node);
    },
    // RN's componentDidUpdate: a changed `disabled` or a changed style opacity re-settles the view,
    // so a Touchable disabled mid-press does not stay stuck at its active opacity.
    afterCommit(node: ISymbioteNode): void {
      const state = states.get(node);
      if (state === undefined) return;
      const resting = restingOpacityOf(node);
      // Through the SAME resolver the press machine uses, not the raw prop: on `button` `disabled`
      // also answers to `aria-disabled` / `accessibilityState` (Button.js:331,337), and reading the
      // prop alone left an aria-only flip un-settled at its active opacity
      const props = propsOf(node);
      const disabled = disabledOf?.(props) ?? props.disabled;
      const previous = state.settled;
      state.settled = { disabled, resting };
      if (previous === undefined) {
        // Set, not animated: this is the mount and RN re-settles on `componentDidUpdate` only.
        // Publishing no `opacity` key here is what `TouchableOpacity-itest.js` ("does not render
        // explicit opacity when using default") says vendor commits for an untouched one
        state.opacity.setValue(resting);
        return;
      }
      if (previous.disabled === disabled && previous.resting === resting)
        return;
      fadeTo(node, state, resting, OPACITY_INACTIVE_DURATION_MS);
    },
    detach(node: ISymbioteNode): void {
      machine.detach(node);
      const state = states.get(node);
      if (state === undefined) return;
      for (const id of state.timers) clearTimeout(id);
      state.timers.clear();
      // RN's componentWillUnmount: stop the animation so a teardown mid-fade leaves no driver
      // running against a node that is gone.
      state.opacity.resetAnimation();
      // Dropping the layer clears `collapsable` on its way out, so only an unbound node still owes
      if (state.isBound) setAnimatedBehaviorStyle(node, undefined);
      else setProp(node, 'collapsable', undefined);
      states.delete(node);
      dlog('touchable-opacity behavior detached');
    },
  };
}

// `focusable`'s three-leg check (disabled, aria-disabled/accessibilityState, `onPress !==
// undefined`) is `foldPressableProps` in C++, reading `OP_SET_OWNED_LISTENER` for the last leg.
// Contract: `touchable-focusable-payload.itest.ts`. `./button` keeps its own copy regardless.

// STILL NEEDED, and for a reason the wire did not remove: `markDirty` on the host marks the node
// whose payload must be rebuilt, but the COMMIT still has to be asked for. A listener flip changes
// no prop on this side, so nothing else would schedule one and the new answer would sit in the host
// until some unrelated write happened to dirty the node.
function onOwnedListenerChange(node: ISymbioteNode, name: string): void {
  if (name !== 'press') return;
  markPropsDirty(node);
  requestCommitFor(node);
}

// Idempotent: an adapter entry may be imported more than once in a bundle.
export function registerTouchableOpacityBehavior(): void {
  const touchable = createTouchableOpacityBehavior(touchableOpacityDisabled);
  registerHostBehavior(TOUCHABLE_OPACITY_TAG, {
    ...touchable,
    onOwnedListenerChange,
  });
}
