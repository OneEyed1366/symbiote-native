// VirtualizedList over the `<scroll-view>` tag's scroll host, Solid supplies only the lifecycle
// The body runs ONCE and `insert` replaces rather than diffs, so rows ride a keyed `<For>` and MOVE

import { splitProps, untrack } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  FIRST_INDEX,
  listStyleOf,
  resolveAccessibilityProps,
} from '@symbiote-native/components';
import { provideVirtualizedListScope } from './nested-scope';
import { buildRow, type IRowDeps } from './list-rows';
import { listBody } from './list-body';
import { createListParts } from './list-parts';
import { createScrollTree } from './scroll-tree';
import { createSeparators } from './use-separators';
import {
  HANDLED_PROPS,
  type IVirtualizedListComponent,
  type IVirtualizedListProps,
} from './virtualized-list-props';

// Re-exported so app code and the package barrel keep one import path for the shared list types
export type {
  ICellLayout,
  ISeparators,
  ISeparatorProps,
  IViewToken,
  IViewableItemsChangedInfo,
  IViewabilityConfig,
  IViewabilityConfigCallbackPair,
  IVirtualizedListHandle,
} from '@symbiote-native/components';
export type {
  ICellRendererComponent,
  ICellRendererProps,
  IVirtualizedListCellInfo,
  IVirtualizedListComponent,
  IVirtualizedListProps,
  IVirtualizedListRenderItem,
} from './virtualized-list-props';

// A slot wrapper counter-flips with an inverted list, then takes the slot's own style
function slotStyleOf(
  props: Pick<IVirtualizedListProps<unknown>, 'inverted' | 'horizontal'>,
  slotStyle: IVirtualizedListProps<unknown>['ListHeaderComponentStyle'],
) {
  return listStyleOf(
    {
      inverted: props.inverted === true,
      horizontal: props.horizontal === true,
    },
    slotStyle,
  );
}

export function createVirtualizedList(): IVirtualizedListComponent {
  return function VirtualizedList<ItemT>(
    props: IVirtualizedListProps<ItemT>,
  ): JSX.Element {
    // Each slot is read once, a JSX prop is a getter that builds the element on read
    const header = untrack(() => props.ListHeaderComponent);
    const footer = untrack(() => props.ListFooterComponent);
    const empty = untrack(() => props.ListEmptyComponent);
    const [, accessibilityRest] = splitProps(props, HANDLED_PROPS);

    const { driver, nesting, sticky, listWindow, handlers } =
      createListParts(props);
    // Solid's `ref` is a compile-time construct, a `ref={list}` call site is already a callback
    if (typeof props.ref === 'function') props.ref(driver.handle);

    const rowDeps: IRowDeps<ItemT> = {
      props,
      listWindow,
      metrics: driver.metrics,
      separators: createSeparators(props, driver.currentCount),
      sticky,
      measureCell: handlers.measureCell,
      focusCell: handlers.focusCell,
    };
    return provideVirtualizedListScope(nesting.scope, () =>
      createScrollTree({
        props,
        accessibility: () => resolveAccessibilityProps(accessibilityRest),
        driver,
        sticky,
        handlers,
        nesting,
        hasHeader: header !== undefined,
        body: () =>
          listBody({
            header,
            footer,
            empty,
            headerStyle: () =>
              slotStyleOf(props, props.ListHeaderComponentStyle),
            footerStyle: () =>
              slotStyleOf(props, props.ListFooterComponentStyle),
            emptyStyle: () => slotStyleOf(props, undefined),
            isEmpty: () => driver.metrics().count === FIRST_INDEX,
            rowKeys: listWindow.rowKeys,
            renderRow: rowKey => buildRow(rowDeps, rowKey),
          }),
      }),
    );
  };
}
