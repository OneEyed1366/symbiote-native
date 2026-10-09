// Compiled, not run: it fails the build if Animated.View stops taking what upstream's takes, or
// starts taking what it should not. `@ts-expect-error` is itself an error when its line compiles
import type { ReactElement } from 'react';
import Animated from './animated';
import {
  css,
  FadeIn,
  FadeOut,
  LinearTransition,
  measure,
  scrollTo,
} from '../core';
import { useAnimatedScrollHandler } from './hooks/use-animated-scroll-handler';
import { useSharedValue } from './hooks/use-shared-value';
import { useAnimatedStyle } from './hooks/use-animated-style';
import { useAnimatedProps } from './hooks/use-animated-props';
import { useAnimatedRef } from './hooks/use-animated-ref';

export function AnimatedViewTakesWhatUpstreamsTakes({
  size,
}: {
  size: number;
}): ReactElement {
  const style = useAnimatedStyle(() => {
    'worklet';
    return { opacity: 1 };
  });
  const animatedProps = useAnimatedProps<{ accessibilityLabel: string }>(() => {
    'worklet';
    return { accessibilityLabel: 'x' };
  });
  const ref = useAnimatedRef();
  const sized = { width: size };
  return (
    <Animated.View
      ref={ref}
      style={[sized, style]}
      animatedProps={animatedProps}
      entering={FadeIn}
      exiting={FadeOut.duration(100)}
      layout={LinearTransition}
    />
  );
}

export function AnimatedRefReachesThePlatformFunctions(): void {
  const ref = useAnimatedRef();
  scrollTo(ref, 0, 0, true);
  measure(ref);
}

export function AnimatedScrollViewTakesAScrollHandler(): ReactElement {
  const onScroll = useAnimatedScrollHandler(() => {
    'worklet';
  });
  const offset = useSharedValue(0);
  return <Animated.ScrollView onScroll={onScroll} scrollViewOffset={offset} />;
}

export function AnimatedViewTakesCssCallbacksAndAnimationStyle(): ReactElement {
  const bounce = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
  const styles = css.create({
    ball: { animationName: bounce, animationDuration: '1s' },
  });
  return (
    <Animated.View
      style={styles.ball}
      onCSSAnimationEnd={() => {}}
      onCSSTransitionStart={() => {}}
    />
  );
}

export function AnimatedViewRefusesAnUnknownProp(): ReactElement {
  return (
    // @ts-expect-error `View` is typed by IViewProps plus the animated ones
    <Animated.View definitelyNotAViewProp={1} />
  );
}

export function AnimatedViewRefusesAWrongEnteringAnimation(): ReactElement {
  return (
    // @ts-expect-error an entering animation is a builder or a function, not a number
    <Animated.View entering={5} />
  );
}
