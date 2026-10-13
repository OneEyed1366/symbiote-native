// Compiled, not run: it fails the build if an animated host tag stops taking what upstream's takes,
// or starts taking what it should not. `@ts-expect-error` is itself an error when its line compiles
import type { IStyleProp, IViewStyle } from '@symbiote-native/engine';
import {
  css,
  FadeIn,
  FadeOut,
  LinearTransition,
  SharedTransition,
} from './index';
import type { AnimatedStyleHandle } from 'react-native-reanimated/src/hook/commonTypes';
import type { IAnimatedHostBase } from './animated-host-props';

type IHost = IAnimatedHostBase<{
  style?: IStyleProp<IViewStyle>;
  accessibilityLabel?: string;
  onLayout?: () => void;
}>;

const bounce = css.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

// A style with a CSS animation in it, which every adapter's host tag has to take
export const bouncingBall = css.create({
  ball: { animationName: bounce, animationDuration: '1s' },
});

export function hostTakesWhatUpstreamsTakes(
  size: number,
  handle: AnimatedStyleHandle<object>,
): IHost {
  return {
    style: [{ width: size }, handle],
    animatedProps: [handle, [handle]],
    entering: FadeIn,
    exiting: FadeOut.duration(100),
    layout: LinearTransition,
    sharedTransitionTag: 'box',
    sharedTransitionStyle: new SharedTransition(),
  };
}

export const hostTakesCssCallbacksAndAnimationStyle: IHost = {
  style: bouncingBall.ball,
  onCSSAnimationEnd: () => {},
  onCSSTransitionStart: () => {},
};

export function hostTakesAHandlerHolderOnAnEventProp(holder: {
  workletEventHandler: unknown;
}): IHost {
  return { onLayout: holder };
}

export const hostRefusesAnUnknownProp: IHost = {
  // @ts-expect-error the host is typed by its own props plus the animated ones
  definitelyNotAViewProp: 1,
};

export const hostRefusesAWrongEnteringAnimation: IHost = {
  // @ts-expect-error an entering animation is a builder or a function, not a number
  entering: 5,
};
