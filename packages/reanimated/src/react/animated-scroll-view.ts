import { createElement, type ReactElement } from 'react';
import type { IScrollViewProps } from '@symbiote-native/react';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type { IAnimatedRef } from '../core/animated-ref';
import type { IAnimatedHostProps } from './animated-host-props';
import { useAnimatedRef } from './hooks/use-animated-ref';
import { useObservedScrollOffset } from './hooks/use-scroll-offset';

// One scroll event per frame, so an animation that follows the scroll has a value every frame
const EVERY_FRAME = 1;

export type IAnimatedScrollViewProps = Omit<
  IAnimatedHostProps<IScrollViewProps>,
  'ref'
> & {
  ref?: IAnimatedRef | null;
  // Receives the scroll position of this view
  scrollViewOffset?: SharedValue<number>;
};

export function AnimatedScrollView({
  scrollViewOffset,
  ref,
  ...rest
}: IAnimatedScrollViewProps): ReactElement {
  const ownRef = useAnimatedRef();
  const animatedRef = ref ?? ownRef;
  useObservedScrollOffset(
    animatedRef,
    scrollViewOffset,
    scrollViewOffset !== undefined,
  );
  return createElement('scroll-view', {
    scrollEventThrottle: EVERY_FRAME,
    ...rest,
    ref: animatedRef,
  });
}
