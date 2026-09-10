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

import {
  AnimatedMock,
  AnimatedValue,
  Easing,
  Platform,
  appListenerFor,
  dlog,
  getExplicitStyle,
  markPropsDirty,
  registerHostBehavior,
  requestCommitFor,
  setAnimatedBehaviorStyle,
  timing,
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
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  DEFAULT_ACTIVE_OPACITY,
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
    node.props.activeOpacity,
    DEFAULT_ACTIVE_OPACITY,
  );
  const handlers = createTouchableFeedbackHandlers(
    {
      delayPressIn: numberOr(node.props.delayPressIn, 0),
      delayPressOut: numberOr(node.props.delayPressOut, 0),
      // Read raw rather than off `config`, which has already defaulted the absent case to the press
      // machine's own 130 ms — a floor RN's Touchables never see (TOUCHABLE_MIN_PRESS_DURATION_MS).
      minPressDuration: numberOr(
        node.props.minPressDuration,
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
        // 0, not 150 (TouchableOpacity.js:215-220): the duration is chosen by where the press-in
        // came from, and every pressIn our engine produces is the grant-equivalent.
        fadeTo(state, activeOpacity, OPACITY_ACTIVE_GRANT_DURATION_MS);
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

const press = createPressBehavior(refine);

// The `id -> nativeID` alias every primitive's spec entry declares, applied here because
// `HOST_PRIMITIVES` deliberately withholds this primitive's entry until the other adapters'
// wrappers collapse to one node (the note at its Pressable neighbour says why). A raw `id` is a key
// no ViewConfig declares, so Fabric drops it and the nativeID is lost on device with nothing red.
//
// Unconditional priority when both are set, matching RN (`View.js:77-79`) and `foldHostBag`.
const foldPayload: IPayloadFold = props => {
  const folded =
    press.foldPayload === undefined ? props : press.foldPayload(props);
  const next: Record<string, unknown> = { ...folded };
  // TouchableOpacity.js:303. The tag is this primitive's only path, so unlike `pressable` there is
  // no wrapper for it to disagree with.
  next.accessible = accessibleUnlessOptedOut(props);
  if (Object.hasOwn(next, 'id')) {
    next.nativeID = next.id;
    delete next.id;
  }
  return next;
};

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
  // `disabled` MEANS to it. `foldPayload` below is the same function either way.
  const machine = createPressBehavior(refine, disabledOf);
  return {
    ...machine,
    foldPayload,
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
      const disabled = disabledOf?.(node.props) ?? node.props.disabled;
      const previous = state.settled;
      state.settled = { disabled, resting };
      if (previous === undefined) {
        // RN's `Animated.View` carries `{opacity: anim}` in its style from the FIRST render, so a
        // resting Touchable commits the key too — a tag that published nothing until the first
        // press would differ from every wrapper on mount. Set rather than animate: this is the
        // mount, and RN re-settles on componentDidUpdate only.
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

// `focusable` is NOT in `foldPayload` above, because its middle leg — `onPress !== undefined`
// (TouchableOpacity.js:338) — is an OWNED name and therefore lives in the stash, which a props-only
// fold cannot reach. `./button` composes this behavior and resolves its own; the tag resolves it
// here, over the node.
//
// `props.disabled`, not `next.disabled`: the press fold strips it (MACHINE_ONLY_KEYS).
function tagFold(node: ISymbioteNode): IPayloadFold {
  return props => {
    const next = foldPayload(props);
    next.focusable = resolveTouchableFocusable(
      booleanOr(props.focusable),
      appListenerFor(node, 'press') !== undefined,
      booleanOr(props.disabled),
    );
    return next;
  };
}

// A listener flip changes no payload by itself, so the commit after it is a no-op and no fold
// re-runs (`IHostBehavior.onOwnedListenerChange`). `./button` carries the twin of this.
function onOwnedListenerChange(node: ISymbioteNode, name: string): void {
  if (name !== 'press') return;
  markPropsDirty(node);
  requestCommitFor(node);
}

// Idempotent: an adapter entry may be imported more than once in a bundle.
export function registerTouchableOpacityBehavior(): void {
  const touchable = createTouchableOpacityBehavior();
  registerHostBehavior(TOUCHABLE_OPACITY_TAG, {
    ...touchable,
    // `attachHostBehavior` writes `behavior.foldPayload` into the field one line BEFORE it calls
    // `attach`, so binding here is what stands. Only the TAG binds it — a composing behavior owns
    // its own node's fold (`./button` sets one in `buildStructure`, which runs later still).
    attach(node: ISymbioteNode): void {
      touchable.attach(node);
      node.payloadFold = tagFold(node);
    },
    onOwnedListenerChange,
  });
}
