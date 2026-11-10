// Compiled, not run: it fails the build if `AnimatedScrollView` stops taking an animated ref
// or starts taking an input it lacks, as `@ts-expect-error` errors when its line compiles
import { AnimatedScrollView } from './animated-scroll-view';
import { hooks } from './services/hooks';

export function scrollViewTakesAnAnimatedRefAndAnOffset(
  view: AnimatedScrollView,
): void {
  view.animatedRef = hooks.useAnimatedRef();
  view.scrollViewOffset = hooks.useSharedValue(0);
}

export function scrollViewPropsTakeAWorkletHandler(
  view: AnimatedScrollView,
): void {
  view.scrollViewProps = {
    onScroll: hooks.useAnimatedScrollHandler(() => {
      'worklet';
    }),
  };
}

export function scrollViewRefusesAnUnknownInput(
  view: AnimatedScrollView,
): void {
  // @ts-expect-error the component declares its inputs
  view.definitelyNotAnInput = 1;
}
