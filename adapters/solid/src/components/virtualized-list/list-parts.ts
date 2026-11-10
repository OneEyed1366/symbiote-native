// What a list is built from: driver, nesting among lists, sticky state, window and handlers

import { onCleanup, untrack } from 'solid-js';
import {
  createListNesting,
  listHasMore,
  resolveItemKey,
  type IListNesting,
} from '@symbiote-native/components';
import { useVirtualizedListScope } from './nested-scope';
import { createListWindow } from './list-window';
import { createScrollHandlers, type IScrollHandlers } from './scroll-handlers';
import { createStickyState } from './sticky-state';
import { createListDriver, type IListDriver } from './use-list-driver';
import type { IVirtualizedListProps } from './virtualized-list-props';

export type IListParts<ItemT> = {
  driver: IListDriver<ItemT>;
  nesting: IListNesting<ItemT>;
  sticky: ReturnType<typeof createStickyState>;
  listWindow: ReturnType<typeof createListWindow>;
  handlers: IScrollHandlers;
};

export function createListParts<ItemT>(
  props: IVirtualizedListProps<ItemT>,
): IListParts<ItemT> {
  // The driver is built first, so it reaches the nesting through `created`, read on first use
  const driver = createListDriver(props, (first, last) =>
    created.findFirstChildWithMore(first, last),
  );
  const created: IListNesting<ItemT> = createListNesting<ItemT>({
    parent: useVirtualizedListScope(),
    horizontal: untrack(() => props.horizontal === true),
    getState: driver.getState,
    dispatch: driver.dispatch,
    getContainerNode: driver.getHostNode,
    getHasMore: () => listHasMore(driver.getState()),
    keyFor: index =>
      resolveItemKey(
        props.getItem(props.data, index),
        index,
        props.keyExtractor,
      ),
    handlers: () => handlers,
  });
  onCleanup(created.detach);
  const sticky = createStickyState(props);
  const listWindow = createListWindow(props, driver.metrics);
  const handlers: IScrollHandlers = createScrollHandlers(
    props,
    driver,
    sticky,
    () => created,
  );
  return { driver, nesting: created, sticky, listWindow, handlers };
}
