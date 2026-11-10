// What a list renders from: config, folded state, place among nested lists, handlers

import { useRef } from 'react';
import type { IListNesting } from '@symbiote-native/components';
import { resolveListConfig, type IListConfig } from './list-config';
import { useVirtualizedListScope } from './nested-scope';
import { useListDriver, type IListDriver } from './use-list-driver';
import { useListNesting, useNestedHandlersRef } from './use-list-nesting';
import { useScrollHandlers, type IScrollHandlers } from './use-scroll-handlers';
import type { IVirtualizedListProps } from './virtualized-list-props';

export type IListParts<ItemT> = {
  config: IListConfig<ItemT>;
  driver: IListDriver<ItemT>;
  nesting: IListNesting<ItemT>;
  handlers: IScrollHandlers;
};

export function useListParts<ItemT>(
  props: IVirtualizedListProps<ItemT>,
): IListParts<ItemT> {
  const parent = useVirtualizedListScope();
  // The config exists before the nesting does, so the window reads it through this ref
  const nestingRef = useRef<IListNesting<ItemT> | null>(null);
  const config = resolveListConfig(
    props,
    (first, last) =>
      nestingRef.current?.findFirstChildWithMore(first, last) ?? null,
  );
  const driver = useListDriver(config);
  const handlersRef = useNestedHandlersRef();
  const nesting = useListNesting({ config, driver, parent, handlersRef });
  nestingRef.current = nesting;
  const handlers = useScrollHandlers({ config, driver, nesting });
  handlersRef.current = handlers;
  return { config, driver, nesting, handlers };
}
