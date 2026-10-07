// The list's child elements: header, the windowed cells with their spacers, footer

import { createElement, type ReactElement, type ReactNode } from 'react';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import {
  FIRST_INDEX,
  LIST_SEGMENT_KIND,
  cellStyleOf,
  listStyleOf,
  planFromMetrics,
  resolveItemKey,
  spacerStyleOf,
  type ICellSegment,
  type IListMetrics,
  type ISpacerSegment,
} from '@symbiote-native/components';
import type { IListConfig } from './list-config';
import {
  renderItemElement,
  renderSeparatorElement,
  resolveElement,
} from './list-elements';
import type { IListSeparators } from './use-separators';

export type IChildrenArgs<ItemT> = {
  config: IListConfig<ItemT>;
  metrics: IListMetrics;
  separators: IListSeparators<ItemT>;
  measureCell: (index: number) => (event: ISymbioteEvent) => void;
  focusCell: (index: number) => () => void;
};

function spacerElement(
  segment: ISpacerSegment,
  horizontal: boolean,
): ReactElement {
  return createElement('view', {
    key: segment.key,
    style: spacerStyleOf(segment.extent, horizontal),
  });
}

// The separator lives INSIDE the cell's measuring wrapper, a sibling would be an extra flex child
// that lands every cell below a collapsed spacer short by the separator plus the gap
// It gates on the last index of the DATA, or a cell's measured height would change with the window
function separatorOf<ItemT>(
  args: IChildrenArgs<ItemT>,
  index: number,
): ReactNode {
  const { config, metrics, separators } = args;
  if (index >= metrics.count - 1) return undefined;
  return renderSeparatorElement(
    config.ItemSeparatorComponent,
    config.getItem(config.data, index),
    config.getItem(config.data, index + 1),
    separators.overridesRef.current.get(index),
  );
}

// A cell the app flagged sticky is wrapped in the `sticky-header` TAG, which pins by document
// order and so survives windowing, nothing here computes a child index
function cellElement<ItemT>(
  args: IChildrenArgs<ItemT>,
  segment: ICellSegment,
  stickySet: ReadonlySet<number> | undefined,
): ReactElement {
  const { config, separators } = args;
  const item = config.getItem(config.data, segment.index);
  const content = renderItemElement(config, {
    item,
    index: segment.index,
    separators: separators.makeSeparators(segment.index),
  });
  const isSticky = stickySet?.has(segment.index) === true;
  const cellProps = {
    key: `cell-${segment.key}`,
    onLayout: args.measureCell(segment.index),
    onFocus: args.focusCell(segment.index),
    style: cellStyleOf(config),
  };
  const separator = separatorOf(args, segment.index);
  if (config.CellRendererComponent === undefined) {
    return createElement(
      isSticky ? 'sticky-header' : 'view',
      cellProps,
      content,
      separator,
    );
  }
  const custom = createElement(
    config.CellRendererComponent,
    { ...cellProps, cellKey: segment.key, index: segment.index, item },
    content,
    separator,
  );
  // RN pins the custom component itself, the sticky wrapper only holds it
  return isSticky
    ? createElement('sticky-header', { key: cellProps.key }, custom)
    : custom;
}

function windowChildren<ItemT>(args: IChildrenArgs<ItemT>): ReactNode[] {
  const { config, metrics } = args;
  if (metrics.count === FIRST_INDEX) {
    const empty = resolveElement(config.ListEmptyComponent);
    return empty === undefined
      ? []
      : [
          createElement(
            'view',
            { key: 'list-empty', style: listStyleOf(config, undefined) },
            empty,
          ),
        ];
  }
  const { plan, stickySet } = planFromMetrics(
    metrics,
    index =>
      resolveItemKey(
        config.getItem(config.data, index),
        index,
        config.keyExtractor,
      ),
    config.stickyHeaderIndices,
  );
  return plan.segments.map(segment =>
    segment.kind === LIST_SEGMENT_KIND.spacer
      ? spacerElement(segment, config.horizontal)
      : cellElement(args, segment, stickySet),
  );
}

// RN wires `onLayout` on the header wrapper only to assign `_headerLength` in VirtualizedList.js
// (facebook/react-native, `_onLayoutHeader`); nothing reads it, so no handler is registered here
function slotChild(
  config: Pick<IListConfig<unknown>, 'inverted' | 'horizontal'>,
  slot: IListConfig<unknown>['ListHeaderComponent'],
  slotStyle: IListConfig<unknown>['ListHeaderComponentStyle'],
  key: string,
): ReactNode[] {
  const element = resolveElement(slot);
  return element === undefined
    ? []
    : [
        createElement(
          'view',
          { key, style: listStyleOf(config, slotStyle) },
          element,
        ),
      ];
}

export function buildListChildren<ItemT>(
  args: IChildrenArgs<ItemT>,
): ReactNode[] {
  const { config } = args;
  return [
    ...slotChild(
      config,
      config.ListHeaderComponent,
      config.ListHeaderComponentStyle,
      'list-header',
    ),
    ...windowChildren(args),
    ...slotChild(
      config,
      config.ListFooterComponent,
      config.ListFooterComponentStyle,
      'list-footer',
    ),
  ];
}
