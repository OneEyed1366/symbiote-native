import { defineComponent, h, shallowRef } from '@vue/runtime-core';
import type { IScrollViewProps } from '@symbiote-native/vue';
import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import type { SharedValue } from 'react-native-reanimated/src/commonTypes';
import type { IAnimatedRef } from '../core/animated-ref';
import type { IAnimatedHostProps } from './animated-host-props';
import { useAnimatedRef } from './composables/use-animated-ref';
import { useObservedScrollOffset } from './composables/use-scroll-offset';

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

type IOwnProps = { scrollViewOffset?: SharedValue<number> };

// A ref on a component gets what it exposes, so the node goes out as `hostNode`
export const AnimatedScrollView = defineComponent({
  name: 'AnimatedScrollView',
  inheritAttrs: false,
  props: ['scrollViewOffset'],
  setup(props: IOwnProps, { attrs, slots, expose }) {
    const ownRef = useAnimatedRef();
    const hostNode = shallowRef<ISymbioteNode | null>(null);
    useObservedScrollOffset(
      ownRef,
      props.scrollViewOffset,
      props.scrollViewOffset !== undefined,
    );
    expose({
      get hostNode() {
        return hostNode.value;
      },
    });
    const captureNode = (instance: unknown): void => {
      hostNode.value = isSymbioteNode(instance) ? instance : null;
      ownRef(instance);
    };
    return () =>
      h(
        'scroll-view',
        { scrollEventThrottle: EVERY_FRAME, ...attrs, ref: captureNode },
        slots,
      );
  },
});
