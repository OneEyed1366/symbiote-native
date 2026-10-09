import { createElement, type ReactElement, type Ref } from 'react';
import {
  FlatList,
  type IFlatListHandle,
  type IFlatListProps,
} from '@symbiote-native/react';
import { LayoutAnimationConfig } from './layout-animation-config';

// One scroll event per frame, so an animation that follows the scroll has a value every frame
const EVERY_FRAME = 1;

// `itemLayoutAnimation` and `CellRendererComponentStyle` need a `CellRendererComponent` on the
// list, which it does not have yet
export type IAnimatedFlatListProps<ItemT> = IFlatListProps<ItemT> & {
  // Rows neither animate in nor out while the list mounts or unmounts
  skipEnteringExitingAnimations?: boolean;
  ref?: Ref<IFlatListHandle>;
};

export function AnimatedFlatList<ItemT>({
  skipEnteringExitingAnimations,
  ...rest
}: IAnimatedFlatListProps<ItemT>): ReactElement {
  const list = createElement(FlatList<ItemT>, {
    scrollEventThrottle: EVERY_FRAME,
    ...rest,
  });
  if (skipEnteringExitingAnimations === undefined) return list;
  return createElement(
    LayoutAnimationConfig,
    { skipEntering: true, skipExiting: true },
    list,
  );
}
