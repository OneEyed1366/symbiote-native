// The list's child VNodes: header, the windowed cells with their spacers, footer

import { h, type VNode } from '@vue/runtime-core';
import {
  FIRST_INDEX,
  LIST_SEGMENT_KIND,
  buildSeparatorProps,
  cellStyleOf,
  listStyleOf,
  planFromMetrics,
  spacerStyleOf,
  type ICellSegment,
  type IListMetrics,
  type ISeparatorProps,
  type ISeparators,
} from '@symbiote-native/components';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { resolveElement } from './list-elements';
import type { INarrowedProps } from './narrow-props';

export type IChildrenArgs<ItemT> = {
  props: INarrowedProps<ItemT>;
  metrics: IListMetrics;
  keyFor: (index: number) => string;
  separatorOverrides: Map<number, Partial<ISeparatorProps<unknown>>>;
  makeSeparators: (index: number) => ISeparators;
  makeCellMeasure: (index: number) => (event: ISymbioteEvent) => void;
  makeCellFocus: (index: number) => () => void;
};

// The separator lives INSIDE the cell's measuring wrapper, a sibling would be an extra flex child
// that lands every cell below a collapsed spacer short by the separator plus the gap
// It gates on the last index of the DATA, or a cell's measured height would change with the window
function separatorOf<ItemT>(
  args: IChildrenArgs<ItemT>,
  index: number,
): VNode | undefined {
  const { props, metrics } = args;
  if (props.itemSeparatorComponent === undefined) return undefined;
  if (index >= metrics.count - 1) return undefined;
  return h(
    props.itemSeparatorComponent,
    buildSeparatorProps<unknown>(
      props.getItem(props.data, index),
      props.getItem(props.data, index + 1),
      args.separatorOverrides.get(index),
    ),
  );
}

// A cell the app flagged sticky IS the `sticky-header` tag, which pins by document order and so
// survives windowing, `stickyHeaderIndices` numbers paint children and does not
function cellVNode<ItemT>(
  args: IChildrenArgs<ItemT>,
  segment: ICellSegment,
  stickySet: ReadonlySet<number> | undefined,
): VNode {
  const { props } = args;
  const content = props.renderItem?.({
    item: props.getItem(props.data, segment.index),
    index: segment.index,
    separators: args.makeSeparators(segment.index),
  });
  const separator = separatorOf(args, segment.index);
  const isSticky = stickySet?.has(segment.index) === true;
  const key = `cell-${segment.key}`;
  const cellProps = {
    onLayout: args.makeCellMeasure(segment.index),
    onFocus: args.makeCellFocus(segment.index),
    style: cellStyleOf(props),
  };
  const children = separator === undefined ? [content] : [content, separator];
  if (props.cellRendererComponent === undefined) {
    return h(
      isSticky ? 'sticky-header' : 'view',
      { key, ...cellProps },
      children,
    );
  }
  const custom = h(
    props.cellRendererComponent,
    {
      key,
      ...cellProps,
      cellKey: segment.key,
      index: segment.index,
      item: props.getItem(props.data, segment.index),
    },
    { default: () => children },
  );
  // RN pins the custom component itself, the sticky wrapper only holds it
  return isSticky ? h('sticky-header', { key }, [custom]) : custom;
}

function windowChildren<ItemT>(args: IChildrenArgs<ItemT>): VNode[] {
  const { props, metrics } = args;
  if (metrics.count === FIRST_INDEX) {
    const empty = resolveElement(props.listEmptyComponent);
    return empty === undefined
      ? []
      : [
          h(
            'view',
            { key: 'list-empty', style: listStyleOf(props, undefined) },
            [empty],
          ),
        ];
  }
  const { plan, stickySet } = planFromMetrics(
    metrics,
    args.keyFor,
    props.stickyHeaderIndices,
  );
  return plan.segments.map(segment =>
    segment.kind === LIST_SEGMENT_KIND.spacer
      ? h('view', {
          key: segment.key,
          style: spacerStyleOf(segment.extent, props.horizontal),
        })
      : cellVNode(args, segment, stickySet),
  );
}

export type IListChildren = {
  children: VNode[];
  hasHeader: boolean;
};

function slotVNodes(
  props: Pick<INarrowedProps<unknown>, 'inverted' | 'horizontal'>,
  slot: VNode | undefined,
  slotStyle: INarrowedProps<unknown>['listHeaderComponentStyle'],
  key: string,
): VNode[] {
  return slot === undefined
    ? []
    : [h('view', { key, style: listStyleOf(props, slotStyle) }, [slot])];
}

export function buildListChildren<ItemT>(
  args: IChildrenArgs<ItemT>,
): IListChildren {
  const header = resolveElement(args.props.listHeaderComponent);
  const footer = resolveElement(args.props.listFooterComponent);
  return {
    hasHeader: header !== undefined,
    children: [
      ...slotVNodes(
        args.props,
        header,
        args.props.listHeaderComponentStyle,
        'list-header',
      ),
      ...windowChildren(args),
      ...slotVNodes(
        args.props,
        footer,
        args.props.listFooterComponentStyle,
        'list-footer',
      ),
    ],
  };
}
