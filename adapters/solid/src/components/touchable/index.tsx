// The Touchable* family for Solid, all built on Pressable. Ported against RN's own sources
// (.vendors/react-native/.../Components/Touchable/*.js), NOT against this repo's React adapter —
// an audit on 2026-08-19 found the React/Vue/Svelte/Angular ports diverge from RN in ten places.
// This adapter is the first on the RN-accurate shared API; the other four migrate in phase two,
// which is why @symbiote-native/components carries both forms for now.
//
// Shared (framework-agnostic) half: the press-scheduling machine, the underlay machine, the resting
// opacity math, the press-handler gate, the extra-style split. Solid owns only the lifecycle —
// signals, memos, the real timers, and the Animated wiring.
//
// NOTHING here destructures `props`. A Solid component body runs ONCE and props are getters, so a
// destructure would freeze the component at its mount-time config; every read below sits inside an
// accessor, a memo or an event handler.
//
// No conditional picks a branch in any of the three trees. Solid's `insert` REPLACES a subtree
// rather than diffing it, and a rebuild landing mid-gesture costs the native responder grant
// (.claude/rules/solid-descriptor-bridge.md §4). Every per-press value here is a prop-bag value,
// and a prop bag reaches the host through `spread` — a per-key diff on the SAME element.

import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  splitProps,
  untrack,
} from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  createHighlightUnderlayHandlers,
  createHighlightUnderlayRuntime,
  createTouchableFeedbackHandlers,
  createTouchableFeedbackRuntime,
  hasTouchablePressHandler,
  resolveHighlightExtraStyles,
  restingOpacityFromStyle,
  DEFAULT_ACTIVE_OPACITY,
  OPACITY_ACTIVE_GRANT_DURATION_MS,
  OPACITY_INACTIVE_DURATION_MS,
  TOUCHABLE_MIN_PRESS_DURATION_MS,
  type IPressTimingProps,
} from '@symbiote-native/components';
import {
  dlog,
  type ISymbioteEvent,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import { Animated } from '../../modules/animated';
import { Pressable, type IPressableProps } from '../pressable';

// Declared here, not imported from @symbiote-native/components and never from another adapter:
// `children` is a framework value, which is exactly the test
// <prop_types_split_agnostic_vs_per_adapter> applies. The agnostic FIELD BASE arrives through
// IPressableProps (itself built on IAccessibilityProps / IAriaProps / IStyleProp / IPressHandler /
// IRectOffset); the two framework-flavoured fields are re-spelled. `style` loses Pressable's
// function form — a Touchable owns its own pressed visual, so the caller does not get to.
type ITouchableBaseProps = Omit<IPressableProps, 'style' | 'children'> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
    children?: JSX.Element;
  };

// The real timers both shared machines schedule on — core/components carries no timer globals, so
// scheduling is the adapter's half. Every canceller is retained so unmount cancels what is still in
// flight: a Solid body runs once, so there is no re-render that would otherwise drop a stale timer,
// and a fired timer would call back into a disposed scope.
function createTimeoutScheduler(): (
  callback: () => void,
  ms: number,
) => () => void {
  const pending = new Set<() => void>();

  onCleanup(() => {
    for (const cancel of [...pending]) cancel();
    pending.clear();
  });

  return (callback, ms) => {
    const id = setTimeout(() => {
      pending.delete(cancel);
      callback();
    }, ms);
    const cancel = (): void => {
      clearTimeout(id);
      pending.delete(cancel);
    };
    pending.add(cancel);
    return cancel;
  };
}

export interface ITouchableOpacityProps extends ITouchableBaseProps {
  activeOpacity?: number;
}

// `class` is split off with `style`: both describe the FEEDBACK node (the inner Animated.View),
// not the outer Pressable that owns the responder. Left in `rest` they would land on the wrong one.
const TOUCHABLE_OPACITY_HANDLED = [
  'activeOpacity',
  'style',
  'class',
  'children',
  'onPressIn',
  'onPressOut',
  'delayPressIn',
  'delayPressOut',
  'minPressDuration',
] as const;

export function TouchableOpacity(props: ITouchableOpacityProps): JSX.Element {
  const [local, rest] = splitProps(props, TOUCHABLE_OPACITY_HANDLED);

  // RN's _getChildStyleOpacityWithDefault: the fade settles at the opacity the CALLER's style asks
  // for, not at a hard 1.
  const restingOpacity = createMemo(() => restingOpacityFromStyle(local.style));

  // One Animated.Value per mount, held by IDENTITY in a plain variable — a signal or store would
  // wrap this engine object in a proxy, and the graph's bookkeeping is keyed on the raw instance
  // (symbiote-engine-core §3). untrack because the body must not subscribe to the initial read.
  const opacity = new Animated.Value(untrack(restingOpacity));
  // The shared press-scheduling cell (delayPressIn canceller + activation clock). A setup-scope
  // object, never reactive: the machine mutates it on every event and nothing reads it reactively.
  const runtime = createTouchableFeedbackRuntime();
  const schedule = createTimeoutScheduler();

  function setOpacityTo(toValue: number, duration: number): void {
    dlog(`TouchableOpacity opacity -> ${toValue} over ${duration}ms`);
    // useNativeDriver: true is RN's own (TouchableOpacity.js:242). opacity is natively drivable and
    // the fade then survives a busy JS thread, which is the whole point of the feedback.
    Animated.timing(opacity, {
      toValue,
      duration,
      easing: Animated.Easing.inOut(Animated.Easing.quad),
      useNativeDriver: true,
    }).start();
  }

  // Rebuilt only when the TIMING config changes — the callbacks read activeOpacity / onPressIn /
  // onPressOut when they fire, so a re-supplied callback is honored without churning the handler
  // identities the host node holds. The runtime persists across rebuilds, so an in-flight
  // delayPressIn timer survives one.
  const handlers = createMemo(() =>
    createTouchableFeedbackHandlers(
      {
        delayPressIn: local.delayPressIn ?? 0,
        delayPressOut: local.delayPressOut ?? 0,
        // RN's Touchables override Pressability's 130ms floor with 0; the active visual is held by
        // the fade's own duration instead.
        minPressDuration:
          local.minPressDuration ?? TOUCHABLE_MIN_PRESS_DURATION_MS,
        schedule,
        now: Date.now,
      },
      runtime,
      {
        activate(event: ISymbioteEvent): void {
          setOpacityTo(
            local.activeOpacity ?? DEFAULT_ACTIVE_OPACITY,
            OPACITY_ACTIVE_GRANT_DURATION_MS,
          );
          local.onPressIn?.(event);
        },
        deactivate(event: ISymbioteEvent): void {
          setOpacityTo(restingOpacity(), OPACITY_INACTIVE_DURATION_MS);
          local.onPressOut?.(event);
        },
      },
    ),
  );

  // RN's componentDidUpdate: a changed `disabled` or a changed style opacity re-settles the view,
  // so a Touchable disabled mid-press does not stay stuck at its active opacity. Skipped on the
  // first run — RN does this on UPDATE only, and firing at mount would animate over the initial
  // value the Animated.Value already holds.
  createEffect<{ disabled: unknown; resting: number } | undefined>(previous => {
    const current = { disabled: rest.disabled, resting: restingOpacity() };
    if (
      previous !== undefined &&
      (previous.disabled !== current.disabled ||
        previous.resting !== current.resting)
    ) {
      setOpacityTo(current.resting, OPACITY_INACTIVE_DURATION_MS);
    }
    return current;
  }, undefined);

  // RN's componentWillUnmount: stop the animation and drop the value back, so a teardown mid-fade
  // leaves no driver running against a node that is gone.
  onCleanup(() => {
    opacity.resetAnimation();
  });

  // Depends on `style` alone. `opacity` is a stable graph node, so a press changes what the node
  // HOLDS, never this array — the per-frame path is value.setValue -> AnimatedProps.update ->
  // setNativeProps, which never re-enters this component.
  const feedbackStyle = createMemo(() => [local.style, { opacity }]);

  // A spread followed by explicit props is safe here only because neither override can be
  // `undefined` — mergeProps takes the first NON-undefined value scanning back-to-front, so an
  // optional override after a spread would silently lose (.claude/rules/solid-descriptor-bridge.md
  // §6). handlers() always returns both functions.
  return (
    <Pressable
      {...rest}
      onPressIn={handlers().handlePressIn}
      onPressOut={handlers().handlePressOut}
    >
      <Animated.View style={feedbackStyle()} class={local.class}>
        {local.children}
      </Animated.View>
    </Pressable>
  );
}

export interface ITouchableHighlightProps extends ITouchableBaseProps {
  activeOpacity?: number;
  underlayColor?: string;
  // RN's own underlay notifications (TouchableHighlight.js), fired on a real transition only.
  onShowUnderlay?: () => void;
  onHideUnderlay?: () => void;
}

// onPress/onPressIn/onPressOut are INTERCEPTED, not forwarded: RN drives the underlay from those
// three callbacks and then calls the caller's. onLongPress stays in `rest` (Pressable fires it
// directly) and is only READ here, for the has-press-handler gate.
const TOUCHABLE_HIGHLIGHT_HANDLED = [
  'activeOpacity',
  'underlayColor',
  'style',
  'children',
  'onPress',
  'onPressIn',
  'onPressOut',
  'onShowUnderlay',
  'onHideUnderlay',
  'delayPressOut',
] as const;

export function TouchableHighlight(
  props: ITouchableHighlightProps,
): JSX.Element {
  const [local, rest] = splitProps(props, TOUCHABLE_HIGHLIGHT_HANDLED);

  // `shown` is NOT `pressed`: RN holds the underlay for delayPressOut past the tap so a fast press
  // still flashes, and the pressed flag is already false by then.
  const [shown, setShown] = createSignal(false);
  const runtime = createHighlightUnderlayRuntime();
  const schedule = createTimeoutScheduler();

  const hasPressHandler = createMemo(() =>
    hasTouchablePressHandler({
      onPress: local.onPress,
      onPressIn: local.onPressIn,
      onPressOut: local.onPressOut,
      onLongPress: rest.onLongPress,
    }),
  );

  const underlay = createMemo(() =>
    createHighlightUnderlayHandlers(
      {
        delayPressOut: local.delayPressOut ?? 0,
        hasPressHandler: hasPressHandler(),
        schedule,
      },
      runtime,
      {
        setShown,
        onShowUnderlay: () => local.onShowUnderlay?.(),
        onHideUnderlay: () => local.onHideUnderlay?.(),
      },
    ),
  );

  const extraStyles = createMemo(() =>
    resolveHighlightExtraStyles({
      shown: shown(),
      hasPressHandler: hasPressHandler(),
      underlayColor: local.underlayColor,
      activeOpacity: local.activeOpacity,
    }),
  );

  // POINT 7 IS DELIBERATELY NOT FIXED HERE, and this is the whole of the divergence from RN.
  // RN clones its single child with `extra.child` so the lowered opacity lands on the CHILD while
  // the container keeps an opaque underlay. Solid has no cloneElement, so the only way to reach the
  // child is a permanent wrapper view — which inserts a node into the flex chain between this
  // container and the children, silently re-parenting any `flex` a child declares. The fake Fabric
  // runs no Yoga, so no headless test can measure that damage, only assert the extra node exists.
  // Shipping an unmeasurable layout change is worse than the visual approximation, so both styles
  // stay on the container (the pre-audit behavior) and the child style is folded in last.
  // resolveHighlightExtraStyles keeps them SEPARATE regardless, so React's cloneElement path and a
  // future Solid fix are both unblocked. A layout-safe fix needs a real device check, not a test.
  const containerStyle = createMemo((): IStyleProp<IViewStyle> => {
    const extra = extraStyles();
    if (extra === undefined) return local.style;
    return [local.style, extra.underlay, extra.child];
  });

  // Visual first, then the caller's callback — RN's order in _createPressabilityConfig.
  const handlePressIn = (event: ISymbioteEvent): void => {
    underlay().handlePressIn(event);
    local.onPressIn?.(event);
  };
  const handlePress = (event: ISymbioteEvent): void => {
    underlay().handlePress(event);
    local.onPress?.(event);
  };
  const handlePressOut = (event: ISymbioteEvent): void => {
    underlay().handlePressOut(event);
    local.onPressOut?.(event);
  };

  return (
    <Pressable
      {...rest}
      style={containerStyle()}
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {local.children}
    </Pressable>
  );
}

export type ITouchableWithoutFeedbackProps = ITouchableBaseProps;

const TOUCHABLE_WITHOUT_FEEDBACK_HANDLED = [
  'children',
  'onPressIn',
  'onPressOut',
  'delayPressIn',
  'delayPressOut',
  'minPressDuration',
] as const;

export function TouchableWithoutFeedback(
  props: ITouchableWithoutFeedbackProps,
): JSX.Element {
  const [local, rest] = splitProps(props, TOUCHABLE_WITHOUT_FEEDBACK_HANDLED);

  // RN's TouchableWithoutFeedback builds a FULL Pressability config with delayPressIn /
  // delayPressOut / minPressDuration: 0 — "without feedback" means no VISUAL, not no timing. The
  // same shared machine TouchableOpacity uses runs here with the visual half left empty.
  const runtime = createTouchableFeedbackRuntime();
  const schedule = createTimeoutScheduler();

  const handlers = createMemo(() =>
    createTouchableFeedbackHandlers(
      {
        delayPressIn: local.delayPressIn ?? 0,
        delayPressOut: local.delayPressOut ?? 0,
        minPressDuration:
          local.minPressDuration ?? TOUCHABLE_MIN_PRESS_DURATION_MS,
        schedule,
        now: Date.now,
      },
      runtime,
      {
        activate(event: ISymbioteEvent): void {
          local.onPressIn?.(event);
        },
        deactivate(event: ISymbioteEvent): void {
          local.onPressOut?.(event);
        },
      },
    ),
  );

  return (
    <Pressable
      {...rest}
      onPressIn={handlers().handlePressIn}
      onPressOut={handlers().handlePressOut}
    >
      {local.children}
    </Pressable>
  );
}
