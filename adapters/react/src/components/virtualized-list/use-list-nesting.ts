// The list's place among nested lists: the scope it hands down and its link to the list above

import { useEffect, useMemo, useRef, type RefObject } from 'react';
import {
  createListNesting,
  listHasMore,
  resolveItemKey,
  type IListNesting,
  type IListScope,
  type INestedHandlers,
} from '@symbiote-native/components';
import type { IListConfig } from './list-config';
import type { IListDriver } from './use-list-driver';

const noop = (): void => {};

const NO_HANDLERS: INestedHandlers = {
  onScroll: noop,
  onScrollBeginDrag: noop,
  onScrollEndDrag: noop,
  onMomentumScrollBegin: noop,
  onMomentumScrollEnd: noop,
  recordInteraction: noop,
};

// Holds the list's own handlers once they exist
export function useNestedHandlersRef(): RefObject<INestedHandlers> {
  return useRef(NO_HANDLERS);
}

export type INestingArgs<ItemT> = {
  config: IListConfig<ItemT>;
  driver: IListDriver<ItemT>;
  parent: IListScope | null;
  // The list's own handlers, set after they exist, so the list above can call them
  handlersRef: RefObject<INestedHandlers>;
};

export function useListNesting<ItemT>(
  args: INestingArgs<ItemT>,
): IListNesting<ItemT> {
  const { parent, handlersRef } = args;
  const latest = useRef(args);
  latest.current = args;
  const horizontal = args.config.horizontal;
  const nesting = useMemo(
    () =>
      createListNesting<ItemT>({
        parent,
        horizontal,
        getState: () => latest.current.driver.state,
        dispatch: action => latest.current.driver.dispatch(action),
        getContainerNode: () => latest.current.driver.scroll.nodeRef.current,
        getHasMore: () => listHasMore(latest.current.driver.state),
        keyFor: index => {
          const { config } = latest.current;
          return resolveItemKey(
            config.getItem(config.data, index),
            index,
            config.keyExtractor,
          );
        },
        handlers: () => handlersRef.current,
      }),
    [parent, horizontal, handlersRef],
  );
  useEffect(() => () => nesting.detach(), [nesting]);
  return nesting;
}
