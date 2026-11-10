// Compiled, not run: a bare `view` takes an animated style and the CSS animation keys,
// alone or in a style array
import type { IViewProps } from '@symbiote-native/solid';
import { hooks } from './primitives/hooks';

const handle = hooks.useAnimatedStyle(() => {
  'worklet';
  return { opacity: 1 };
});

export const viewTakesAnimatedStyle: IViewProps = { style: handle };

export const viewTakesAnimatedStyleInAnArray: IViewProps = {
  style: [{ width: 10 }, handle],
};

export const viewTakesCssAnimationKeys: IViewProps = {
  style: {
    animationName: { from: { opacity: 0 }, to: { opacity: 1 } },
    animationDuration: '600ms',
  },
};
