// VirtualizedList over the `scroll-view` TAG, spacers stand in for the cells outside the window
// The orchestration is the shared `reduceList` machine, React supplies lifecycle and elements

import { useImperativeHandle, type ReactElement, type Ref } from 'react';
import { dlog } from '@symbiote-native/engine';
import {
  buildListHandle,
  type ICellLayout,
  type ISeparators,
  type ISeparatorProps,
  type IViewToken,
  type IViewableItemsChangedInfo,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IVirtualizedListHandle,
} from '@symbiote-native/components';
import { buildListChildren } from './list-children';
import { listHostOf } from './list-host';
import { accessibilityRestOf, buildScrollProps } from './list-scroll-props';
import { useListParts } from './use-list-parts';
import { useSeparators } from './use-separators';
import type {
  ICellRendererComponent,
  ICellRendererProps,
  IListItemInfo,
  IRenderItem,
  ISeparatorComponent,
  IVirtualizedListProps,
} from './virtualized-list-props';

// The shared list types keep their import path for flat-list and the section list
export type {
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
};
export type {
  ICellRendererComponent,
  ICellRendererProps,
  IListItemInfo,
  IRenderItem,
  ISeparatorComponent,
  IVirtualizedListProps,
};

// React 19 passes `ref` as a regular prop, so a generic function component can expose an
// imperative handle without `forwardRef`, which erases the `ItemT` generic
export function VirtualizedList<ItemT>(
  props: IVirtualizedListProps<ItemT> & { ref?: Ref<IVirtualizedListHandle> },
): ReactElement {
  const { config, driver, nesting, handlers } = useListParts(props);
  const { state, dispatch, scroll } = driver;
  const metrics = state.metrics;
  const separators = useSeparators<ItemT>(metrics.count);
  useImperativeHandle(
    props.ref ?? null,
    () =>
      buildListHandle({
        dispatch,
        scrollHandle: scroll.handle,
        getNode: () => scroll.nodeRef.current,
      }),
    [dispatch, scroll.handle, scroll.nodeRef],
  );
  dlog(
    `VirtualizedList window [${metrics.first}, ${metrics.last}] of ${metrics.count} ` +
      `(offset=${state.scrollOffset}, viewport=${state.viewportLength})`,
  );

  const accessibilityRest = accessibilityRestOf(props);
  return listHostOf({
    config,
    nesting,
    accessibilityRest,
    nodeRef: scroll.nodeRef,
    children: buildListChildren({
      config,
      metrics,
      separators,
      measureCell: handlers.measureCell,
      focusCell: handlers.focusCell,
    }),
    scrollProps: buildScrollProps({
      config,
      accessibilityRest,
      total: metrics.total,
      onScroll: handlers.onScroll,
      onScrollBeginDrag: handlers.onScrollBeginDrag,
      onScrollEndDrag: handlers.onScrollEndDrag,
      onMomentumScrollBegin: handlers.onMomentumScrollBegin,
      onMomentumScrollEnd: handlers.onMomentumScrollEnd,
      onContentSizeChange: handlers.onContentSizeChange,
      onLayout: handlers.onViewportLayout,
      commandedOffset: scroll.commandedOffset,
      hasHeader: config.ListHeaderComponent !== undefined,
    }),
  });
}
