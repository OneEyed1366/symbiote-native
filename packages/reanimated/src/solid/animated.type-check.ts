// Compiled, not run: it fails the build if `Animated.View` stops taking an animated ref
// or starts taking a prop its view lacks, as `@ts-expect-error` errors when its line compiles
import type { IViewProps } from '@symbiote-native/solid';
import type { IAnimatedHostProps } from './animated';
import { hooks } from './primitives/hooks';

type IView = IAnimatedHostProps<IViewProps>;

export function viewTakesAnAnimatedRef(): IView {
  return { ref: hooks.useAnimatedRef() };
}

export const viewRefusesAnUnknownProp: IView = {
  // @ts-expect-error `View` is typed by IViewProps plus the animated ones
  definitelyNotAViewProp: 1,
};
