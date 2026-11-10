import { splitProps } from 'solid-js';
import type { IScrollViewProps } from '@symbiote-native/solid';
import type { ISymbioteNode } from '@symbiote-native/engine';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type { IAnimatedHostProps } from './animated-host-props';
import { hostNode } from './host-node';
import { hooks } from './primitives/hooks';

// One scroll event per frame, so an animation that follows the scroll has a value every frame
const EVERY_FRAME = 1;

const { useAnimatedRef, useObservedScrollOffset } = hooks;

export type IAnimatedScrollViewProps = IAnimatedHostProps<IScrollViewProps> & {
  // Receives the scroll position of this view
  scrollViewOffset?: SharedValue<number>;
};

export function AnimatedScrollView(
  props: IAnimatedScrollViewProps,
): ISymbioteNode {
  const [own, rest] = splitProps(props, [
    'scrollViewOffset',
    'ref',
    'children',
  ]);
  const ownRef = useAnimatedRef();
  useObservedScrollOffset(
    ownRef,
    own.scrollViewOffset,
    own.scrollViewOffset !== undefined,
  );
  const captureNode = (node: ISymbioteNode): void => {
    ownRef(node);
    if (typeof own.ref === 'function') own.ref(node);
  };
  return hostNode(
    'scroll-view',
    () => ({ scrollEventThrottle: EVERY_FRAME, ...rest, ref: captureNode }),
    () => own.children,
  );
}
