// Native scroll, layout and cell-measure events turned into reducer actions

import { createMemo, type Accessor } from 'solid-js';
import {
  LIST_ACTION_KIND,
  createListHandlers,
  forwardScrollEvent,
  resolveItemKey,
  type IListHandlers,
  type IListNesting,
} from '@symbiote-native/components';
import {
  event as animatedEvent,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import type { IListDriver } from './use-list-driver';
import type { IStickyState } from './sticky-state';
import type { IVirtualizedListProps } from './virtualized-list-props';

export type IScrollHandlers = Omit<IListHandlers, 'makeCellMeasure'> & {
  // The cell index is an accessor, a keyed row's data index moves under it as the window slides
  measureCell: (index: Accessor<number>) => (event: ISymbioteEvent) => void;
  focusCell: (index: Accessor<number>) => () => void;
  // The handler the scroll tag gets, wrapped in `Animated.event` on the JS-driven sticky path
  scrollHandler: Accessor<unknown>;
};

export function createScrollHandlers<ItemT>(
  props: IVirtualizedListProps<ItemT>,
  driver: Pick<
    IListDriver<ItemT>,
    'dispatch' | 'clearCommandedOffset' | 'getHostNode'
  >,
  sticky: Pick<IStickyState, 'forwarding' | 'scrollAnimatedValue'>,
  nesting: () => IListNesting<ItemT>,
): IScrollHandlers {
  const { dispatch } = driver;
  const core = createListHandlers<ItemT>({
    isHorizontal: () => props.horizontal === true,
    user: () => props,
    nesting,
    dispatch,
    clearCommandedOffset: driver.clearCommandedOffset,
    getNode: driver.getHostNode,
    keyFor: index =>
      resolveItemKey(
        props.getItem(props.data, index),
        index,
        props.keyExtractor,
      ),
  });

  // Without the native animated module the sticky value is driven off the JS thread, so the
  // handler is wrapped in `Animated.event`, the native and plain paths forward it untouched
  const scrollHandler = createMemo((): unknown => {
    if (sticky.forwarding().mode !== 'sticky-js') return core.onScroll;
    return animatedEvent(
      [{ nativeEvent: { contentOffset: { y: sticky.scrollAnimatedValue } } }],
      {
        listener: (...args: unknown[]): void =>
          forwardScrollEvent(core.onScroll, args),
      },
    );
  });

  return {
    ...core,
    scrollHandler,
    measureCell: index => event => core.makeCellMeasure(index())(event),
    focusCell: index => () =>
      dispatch({ kind: LIST_ACTION_KIND.cellFocused, index: index() }),
  };
}
