// The rows of the windowed list: a cell with its separator, or a spacer standing in for a gap

import { Show, createMemo, on, untrack, type Accessor } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  EMPTY_OFFSET,
  LIST_SEGMENT_KIND,
  NO_INDEX,
  cellStyleOf,
  spacerStyleOf,
  type IListMetrics,
  type IListSegment,
} from '@symbiote-native/components';
import type { ISymbioteEvent } from '@symbiote-native/engine';
import { renderItemContent } from './item-content';
import type { IListWindow } from './list-window';
import { ScrollViewStickyHeader } from './sticky-header';
import type { IStickyState } from './sticky-state';
import type { IListSeparators } from './use-separators';
import type { IVirtualizedListProps } from './virtualized-list-props';

export type IRowDeps<ItemT> = {
  props: IVirtualizedListProps<ItemT>;
  listWindow: IListWindow;
  metrics: Accessor<IListMetrics>;
  separators: IListSeparators<ItemT>;
  sticky: IStickyState;
  // Without `getItemLayout` the list learns its cell sizes from each cell's own `onLayout`
  measureCell: (index: Accessor<number>) => (event: ISymbioteEvent) => void;
  focusCell: (index: Accessor<number>) => () => void;
};

function separatorElement<ItemT>(
  deps: IRowDeps<ItemT>,
  index: number,
): JSX.Element {
  const Separator = deps.props.ItemSeparatorComponent;
  if (Separator === undefined) return undefined;
  // A spread of a CALL compiles to `mergeProps(() => ...)`, so the separator's props stay live
  return <Separator {...deps.separators.separatorPropsFor(index)} />;
}

// RN gates the separator on the last index of the DATA, not of the WINDOW: it lives INSIDE the
// measuring wrapper, so gating on the window would change a cell's height as the window slides
function hasSeparatorAfter<ItemT>(
  deps: IRowDeps<ItemT>,
  index: number,
): boolean {
  return (
    deps.props.ItemSeparatorComponent !== undefined &&
    index < deps.metrics().count - 1
  );
}

type ICellParts = { content: JSX.Element; separator: JSX.Element };

function cellPartsOf<ItemT>(
  deps: IRowDeps<ItemT>,
  index: Accessor<number>,
): ICellParts {
  const { props } = deps;
  // Called once and untracked, a tracked call would rebuild the subtree on every window step
  const content = untrack(() =>
    renderItemContent(props, () => ({
      item: props.getItem(props.data, index()),
      index: index(),
      separators: deps.separators.makeSeparators(index()),
    })),
  );
  // The separator rides INSIDE the measuring wrapper, as a sibling it would be an extra flex child
  const separator = (
    <Show when={hasSeparatorAfter(deps, index())}>
      <view>{separatorElement(deps, index())}</view>
    </Show>
  );
  return { content, separator };
}

// The view around a cell, or the app's `CellRendererComponent` standing in for it
function cellWrapper<ItemT>(
  deps: IRowDeps<ItemT>,
  index: Accessor<number>,
  cellKey: string,
  parts: ICellParts,
): JSX.Element {
  const { props } = deps;
  const style = cellStyleOf({
    inverted: props.inverted === true,
    horizontal: props.horizontal === true,
  });
  const Custom = props.CellRendererComponent;
  if (Custom === undefined) {
    return (
      <view
        onLayout={deps.measureCell(index)}
        onFocus={deps.focusCell(index)}
        style={style}
      >
        {parts.content}
        {parts.separator}
      </view>
    );
  }
  return (
    <Custom
      cellKey={cellKey}
      index={index()}
      item={props.getItem(props.data, index())}
      style={style}
      onLayout={deps.measureCell(index)}
      onFocus={deps.focusCell(index)}
    >
      {parts.content}
      {parts.separator}
    </Custom>
  );
}

function buildCell<ItemT>(
  deps: IRowDeps<ItemT>,
  index: Accessor<number>,
  sticky: boolean,
  cellKey: string,
): JSX.Element {
  const { props } = deps;
  const parts = cellPartsOf(deps, index);
  if (!sticky) return cellWrapper(deps, index, cellKey, parts);
  // A plain sticky cell is measured by the header itself, which REPLACES the view rather than
  // nesting, the app's own cell component stays inside it
  // Every reactive input is a CALL so the header reads it in its own effect
  return (
    <ScrollViewStickyHeader
      onLayout={deps.sticky.makeStickyCellLayout(
        index,
        deps.measureCell(index),
      )}
      onFocus={deps.focusCell(index)}
      nextHeaderLayoutY={deps.sticky.nextStickyHeaderYFor(
        index(),
        deps.listWindow.mountedIndices(),
      )}
      scrollAnimatedValue={deps.sticky.scrollAnimatedValue}
      inverted={undefined}
      hiddenOnScroll={props.stickyHeaderHiddenOnScroll}
      scrollViewHeight={undefined}
    >
      {props.CellRendererComponent === undefined
        ? [parts.content, parts.separator]
        : cellWrapper(deps, index, cellKey, parts)}
    </ScrollViewStickyHeader>
  );
}

// A row is keyed, so its segment changes under it as the window slides, the previous value covers
// the tick between a key leaving the plan and `<For>` disposing the row
function latestSegmentValue<ItemT, TValue>(
  deps: IRowDeps<ItemT>,
  rowKey: string,
  read: (segment: IListSegment) => TValue | undefined,
  initial: TValue,
): Accessor<TValue> {
  return createMemo((previous: TValue) => {
    const segment = deps.listWindow.segmentOf(rowKey);
    return (segment === undefined ? undefined : read(segment)) ?? previous;
  }, initial);
}

function buildCellRow<ItemT>(
  deps: IRowDeps<ItemT>,
  rowKey: string,
): JSX.Element {
  const index = latestSegmentValue(
    deps,
    rowKey,
    segment =>
      segment.kind === LIST_SEGMENT_KIND.cell ? segment.index : undefined,
    NO_INDEX,
  );
  const isSticky = createMemo(
    () => deps.listWindow.stickySet()?.has(index()) === true,
  );
  // A sticky cell is a different host subtree, not a different prop, and Solid has no reconciler to
  // swap one for the other, so the flip is an explicit rebuild boundary keyed on the discriminator
  // The row is keyed by its cell's key, which never changes over the row's life
  const segment = deps.listWindow.segmentOf(rowKey);
  const cellKey =
    segment?.kind === LIST_SEGMENT_KIND.cell ? segment.key : rowKey;
  return createMemo(
    on(isSticky, sticky => buildCell(deps, index, sticky, cellKey)),
  );
}

function buildSpacerRow<ItemT>(
  deps: IRowDeps<ItemT>,
  rowKey: string,
): JSX.Element {
  const extent = latestSegmentValue(
    deps,
    rowKey,
    segment =>
      segment.kind === LIST_SEGMENT_KIND.spacer ? segment.extent : undefined,
    EMPTY_OFFSET,
  );
  return (
    <view style={spacerStyleOf(extent(), deps.props.horizontal === true)} />
  );
}

export function buildRow<ItemT>(
  deps: IRowDeps<ItemT>,
  rowKey: string,
): JSX.Element {
  const isSpacer =
    deps.listWindow.segmentOf(rowKey)?.kind === LIST_SEGMENT_KIND.spacer;
  return isSpacer ? buildSpacerRow(deps, rowKey) : buildCellRow(deps, rowKey);
}
