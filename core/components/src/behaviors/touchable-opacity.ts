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

function fadeTo(state: IFeedbackState, toValue: number, ms: number): void {
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
        // TouchableOpacity.js:215-220 picks the duration from WHERE the press-in came from: our
        // engine's own 'pressIn' event (an ordinary grant, or its delayed replay) is the 0ms leg;
        // a drift-out/drift-back-in reactivation arrives as 'responderMove'
        // (`state/pressable.ts`'s `handleResponderMove`) and gets the 150ms ease-back-in instead.
        const duration =
          event.type === 'responderMove'
            ? OPACITY_ACTIVE_DURATION_MS
            : OPACITY_ACTIVE_GRANT_DURATION_MS;
        fadeTo(state, activeOpacity, duration);
        config.onPressIn?.(event);
      },
      deactivate(event: ISymbioteEvent): void {
        fadeTo(state, resting, OPACITY_INACTIVE_DURATION_MS);
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
      };
      states.set(node, state);
      // Bound at ATTACH rather than at the first press, matching RN: the binding is what forces
      // `collapsable: false`, and a view Fabric un-flattens mid-gesture would lose the responder.
      // Nothing is published until a fade runs — the leaf writes only when its value moves.
      setAnimatedBehaviorStyle(node, { opacity: state.opacity });
      machine.attach(node);
    },
    // RN's componentDidUpdate: a changed `disabled` or a changed style opacity re-settles the view,
    // so a Touchable disabled mid-press does not stay stuck at its active opacity.
    afterCommit(node: ISymbioteNode): void {
      const state = states.get(node);
      if (state === undefined) return;
      const resting = restingOpacityOf(node);
      // Through the SAME resolver the press machine uses, not the raw prop: on Button `disabled` is
      // the three-way answer of `props.disabled ?? aria-disabled ?? accessibilityState.disabled`
      // (Button.js:331,337), so reading the prop here left an aria-only flip un-settled — the view
      // stayed at its active opacity while the press was already suppressed. RN's Button has no
      // such gap because it passes the resolved value DOWN as its touchable's prop.
      const props = propsOf(node);
      const disabled = disabledOf?.(props) ?? props.disabled;
      const previous = state.settled;
      state.settled = { disabled, resting };
      if (previous === undefined) {
        // NOT vendor parity, despite this comment's old claim: `TouchableOpacity-itest.js` ("does
        // not render explicit opacity when using default") proves a resting, untouched
        // TouchableOpacity commits no `opacity` key at all. Vendor's native-animated leaf is a
        // separate channel from the ordinary style diff, so forcing non-flattening never implies
        // publishing a value. Ours publishes anyway: `setAnimatedBehaviorStyle`/`bindAnimatedValue`
        // (`host-binding.ts`) force `collapsable: false` and resolve+write the leaf's value in the
        // SAME call. Untangling that is a change to shared animation infrastructure, not a one-line
        // fix here — deferred, see the audit skill. Set rather than animate: this is the mount, and
        // RN re-settles on componentDidUpdate only.
        //
        // TODO(rn-parity): skip this initial publish when `resting === RESTING_OPACITY` (1, Fabric's
        // own opacity default) and no authored `style.opacity` needs another route to Fabric, so a
        // resting default TouchableOpacity commits no `opacity` key — matching vendor. Needs
        // `bindAnimatedValue`/`host-binding.ts` to separate "force collapsable:false" from "publish
        // the leaf's value" (shared by every animated-behavior consumer, not just this tag), plus a
        // new test for the untouched-default case (no existing case in touchable-opacity.test.ts
        // covers it — every case authors an explicit style.opacity first).
        state.opacity.setValue(resting);
        return;
      }
      if (previous.disabled === disabled && previous.resting === resting)
        return;
      fadeTo(state, resting, OPACITY_INACTIVE_DURATION_MS);
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
      setAnimatedBehaviorStyle(node, undefined);
      states.delete(node);
      dlog('touchable-opacity behavior detached');
    },
  };
}

// THIS TAG NOW COSTS ZERO TRIPS INTO JS (2026-09-18). `focusable` was the last thing here, and it
// held out because its middle leg — `onPress !== undefined` (TouchableOpacity.js:338) — is an OWNED
// name that lives in the stash and never becomes a prop, so a props-only rule could not see it.
//
// What moved was not the closure but ONE BIT. `setEventListener` already knew the flip (it computes
// `wasWired !== isHandler` to fire `onOwnedListenerChange`); it now also records
// `OP_SET_OWNED_LISTENER`, and `foldPressableProps` resolves the whole three-leg expression off the
// node. The callback itself never left JS and never will — that is the split a browser draws too,
// where the UA knows which elements carry a click handler and the handler's body stays the page's.
//
// So "a rule cannot read an owned listener" was two claims wearing one sentence, and only the one
// about the FUNCTION was true. Contract:
// `core/engine/cpp/tests/js/touchable-focusable-payload.itest.ts`.
//
// `./button` keeps its own fold and its own resolution, deliberately: it resolves `disabled` three
// ways through the projection its derived children share, and it folds an Android view style and
// ripple regardless — so moving only its `focusable` would duplicate that precedence and buy back
// no crossing.

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
