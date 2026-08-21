// The Touchable* family, all built on Pressable. Ported against RN's own sources
// (.vendors/react-native/.../Components/Touchable/*.js) after the 2026-08-19 audit found ten
// divergences; the shared halves live in @symbiote-native/components and React owns only the
// lifecycle — refs, effects, the real timers, the Animated wiring, and the child clone:
//   TouchableOpacity:   an Animated.Value fades toward activeOpacity on press-in and back to the
//     style's own resting opacity on press-out, driven from onPressIn/onPressOut.
//   TouchableHighlight: the underlay machine drives a `shown` flag (NOT `pressed` — RN holds the
//     underlay for delayPressOut past the tap); the container takes the underlay color and the
//     child takes the lowered opacity, RN's split.
//   TouchableWithoutFeedback: the same press-timing machine with the visual half left empty —
//     "without feedback" means no VISUAL, not no timing.

import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from 'react';
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
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { Pressable, type IPressableProps } from '../pressable';
import { Animated } from '../../modules/animated';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

// `style` loses Pressable's function form — a Touchable owns its own pressed visual, so the
// caller does not get to drive one off press state.
type ITouchableBaseProps = Omit<IPressableProps, 'style' | 'children'> &
  IPressTimingProps & {
    style?: IStyleProp<IViewStyle>;
    children?: ReactNode;
  };

export interface ITouchableOpacityProps extends ITouchableBaseProps {
  activeOpacity?: number;
}

// The real setTimeout the shared machines schedule on (core/components has no timer globals).
// Returns a canceller so an early release flushes the timer.
function scheduleTimeout(callback: () => void, ms: number): () => void {
  const id = setTimeout(callback, ms);
  return () => clearTimeout(id);
}

export const TouchableOpacity: FC<ITouchableOpacityProps> = props => {
  const {
    activeOpacity = DEFAULT_ACTIVE_OPACITY,
    style,
    // className is pulled out here, like style, and applied to the inner Animated.View below —
    // left in ...rest it would land on the outer Pressable instead, which is not where `style`
    // (the opacity-fade node) goes.
    className,
    children,
    disabled,
    onPressIn,
    onPressOut,
    delayPressIn = 0,
    delayPressOut = 0,
    // RN's Touchables override Pressability's 130ms floor with 0 (TouchableOpacity.js:195); the
    // active visual is held by the fade's own duration instead.
    minPressDuration = TOUCHABLE_MIN_PRESS_DURATION_MS,
    ...rest
  } = props;

  // RN's _getChildStyleOpacityWithDefault: the fade settles at the opacity the CALLER's style
  // asks for, not at a hard 1 — and must START there, or the first paint jumps to fully opaque.
  const restingOpacity = restingOpacityFromStyle(style);
  // One Animated.Value per mount. The Animated.View leaf commits its current value every frame,
  // so timing it animates the real view.
  const opacity = useRef(new Animated.Value(restingOpacity)).current;
  // The shared press-scheduling cell (delayPressIn timer + activation clock), held across renders.
  const runtime = useRef(createTouchableFeedbackRuntime()).current;

  function setOpacityTo(toValue: number, duration: number): void {
    // useNativeDriver: true is RN's own (TouchableOpacity.js:242). opacity is natively drivable
    // and the fade then survives a busy JS thread, which is the whole point of the feedback.
    Animated.timing(opacity, {
      toValue,
      duration,
      easing: Animated.Easing.inOut(Animated.Easing.quad),
      useNativeDriver: true,
    }).start();
  }

  // RN's componentDidUpdate: a changed `disabled` or a changed style opacity re-settles the view,
  // so a Touchable disabled mid-press does not stay stuck at its active opacity.
  const hasRendered = useRef(false);
  useEffect(() => {
    // RN runs this on UPDATE only. Firing at mount would animate over the value the
    // Animated.Value was just constructed with.
    if (!hasRendered.current) {
      hasRendered.current = true;
      return;
    }
    setOpacityTo(restingOpacity, OPACITY_INACTIVE_DURATION_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setOpacityTo is re-made per render
  }, [disabled, restingOpacity]);

  // RN's componentWillUnmount: stop the fade so a teardown mid-animation leaves no driver running
  // against a node that is gone.
  useEffect(
    () => () => {
      opacity.resetAnimation();
    },
    [opacity],
  );

  // The shared machine owns the delayPressIn/minPressDuration scheduling; the adapter supplies only
  // the native seam — the Animated opacity fade + the framework emit — as activate/deactivate.
  const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
    {
      delayPressIn,
      delayPressOut,
      minPressDuration,
      schedule: scheduleTimeout,
      now: Date.now,
    },
    runtime,
    {
      activate(event) {
        setOpacityTo(activeOpacity, OPACITY_ACTIVE_GRANT_DURATION_MS);
        onPressIn?.(event);
      },
      deactivate(event) {
        setOpacityTo(restingOpacity, OPACITY_INACTIVE_DURATION_MS);
        onPressOut?.(event);
      },
    },
  );

  return createElement(
    Pressable,
    { ...rest, disabled, onPressIn: handlePressIn, onPressOut: handlePressOut },
    createElement(
      Animated.View,
      { style: [style, { opacity }], className },
      children,
    ),
  );
};

export interface ITouchableHighlightProps extends ITouchableBaseProps {
  activeOpacity?: number;
  underlayColor?: string;
  // RN's own underlay notifications (TouchableHighlight.js), fired on a real transition only.
  onShowUnderlay?: () => void;
  onHideUnderlay?: () => void;
}

// RN's render: the lowered opacity is cloned onto the CHILD while the container keeps an opaque
// underlay (TouchableHighlight.js). Fold both onto the container instead and the opacity fades the
// very underlay it is meant to reveal — `underlayColor: 'black'` paints grey. React is the one
// adapter that can reach the child without a wrapper view perturbing the flex chain.
// A non-element child (text, a fragment, nothing at all) has no style prop to compose onto, so it
// passes through untouched rather than throwing the way RN's Children.only would.
function withChildStyle(children: ReactNode, extra: IViewStyle): ReactNode {
  const child: unknown = Children.count(children) === 1 ? children : undefined;
  if (!isValidElement<{ style?: IStyleProp<IViewStyle> }>(child))
    return children;
  return cloneElement(child, { style: [child.props.style, extra] });
}

export const TouchableHighlight: FC<ITouchableHighlightProps> = props => {
  const {
    activeOpacity,
    underlayColor,
    style,
    children,
    onPress,
    onPressIn,
    onPressOut,
    onShowUnderlay,
    onHideUnderlay,
    delayPressOut = 0,
    ...rest
  } = props;

  // `shown` is NOT `pressed`: RN holds the underlay for delayPressOut past the tap so a press too
  // fast to see still flashes, and the pressed flag is already false by then.
  const [shown, setShown] = useState(false);
  const runtime = useRef(createHighlightUnderlayRuntime()).current;

  // RN's _hasPressHandler gate: no press handler, no underlay. onLongPress is only READ here —
  // it stays in `rest` for Pressable to fire directly.
  const hasPressHandler = hasTouchablePressHandler({
    onPress,
    onPressIn,
    onPressOut,
    onLongPress: rest.onLongPress,
  });

  const underlay = createHighlightUnderlayHandlers(
    { delayPressOut, hasPressHandler, schedule: scheduleTimeout },
    runtime,
    { setShown, onShowUnderlay, onHideUnderlay },
  );

  const extraStyles = resolveHighlightExtraStyles({
    shown,
    hasPressHandler,
    underlayColor,
    activeOpacity,
  });

  // Visual first, then the caller's callback — RN's order in _createPressabilityConfig.
  function handlePressIn(event: ISymbioteEvent): void {
    underlay.handlePressIn(event);
    onPressIn?.(event);
  }
  function handlePress(event: ISymbioteEvent): void {
    underlay.handlePress(event);
    onPress?.(event);
  }
  function handlePressOut(event: ISymbioteEvent): void {
    underlay.handlePressOut(event);
    onPressOut?.(event);
  }

  return createElement(
    Pressable,
    {
      ...rest,
      style: extraStyles === undefined ? style : [style, extraStyles.underlay],
      onPress: handlePress,
      onPressIn: handlePressIn,
      onPressOut: handlePressOut,
    },
    extraStyles === undefined
      ? children
      : withChildStyle(children, extraStyles.child),
  );
};

export type ITouchableWithoutFeedbackProps = ITouchableBaseProps;

export const TouchableWithoutFeedback: FC<
  ITouchableWithoutFeedbackProps
> = props => {
  const {
    children,
    onPressIn,
    onPressOut,
    delayPressIn = 0,
    delayPressOut = 0,
    minPressDuration = TOUCHABLE_MIN_PRESS_DURATION_MS,
    ...rest
  } = props;

  // RN's TouchableWithoutFeedback builds a FULL Pressability config with delayPressIn /
  // delayPressOut / minPressDuration: 0 — the same shared machine TouchableOpacity uses, with the
  // visual half left empty. Spreading the delay props onto Pressable instead did nothing: it does
  // not read them, and they leaked to the host as unknown props.
  const runtime = useRef(createTouchableFeedbackRuntime()).current;

  const { handlePressIn, handlePressOut } = createTouchableFeedbackHandlers(
    {
      delayPressIn,
      delayPressOut,
      minPressDuration,
      schedule: scheduleTimeout,
      now: Date.now,
    },
    runtime,
    {
      activate(event) {
        onPressIn?.(event);
      },
      deactivate(event) {
        onPressOut?.(event);
      },
    },
  );

  return createElement(
    Pressable,
    { ...rest, onPressIn: handlePressIn, onPressOut: handlePressOut },
    children,
  );
};
