// FlatList: the convenience surface over VirtualizedList. It takes a plain `data` array and
// derives getItem/getItemCount, so callers never touch the VirtualizedList data-access protocol.
// `numColumns` packs that many items into each row (a horizontal sub-View), so the virtualized
// stream is rows, not items (RN's FlatList). All windowing, viewability, batching, and imperative
// scrolling are inherited from VirtualizedList; the data shaping and the row/viewability/separator
// transforms are shared from @symbiote-native/components. This file only adapts to React's lifecycle
// (element creation + ref threading).

import {
  createElement,
  type ComponentType,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import {
  Platform,
  dlog,
  resolveClassName,
  type ISymbioteEvent,
} from '@symbiote-native/engine';
import {
  SINGLE_COLUMN,
  arrayLikeLength,
  chunkIntoRows,
  expandRowToken,
  expandRowViewability,
  firstItemOfRow,
  lastItemOfRow,
  removeClippedSubviewsOrDefault,
  rowKeyExtractor,
  type IRow,
} from '@symbiote-native/components';
import {
  VirtualizedList,
  type ICellRendererComponent,
  type ISeparators,
  type ISeparatorProps,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
  type IVirtualizedListHandle,
} from '../virtualized-list';
import type {
  IAccessibilityProps,
  IAriaProps,
  IInnerViewRef,
} from '@symbiote-native/components';
import type { IStyleProp, IViewStyle } from '../../utils/styles';

type IRenderItem<ItemT> = (info: {
  item: ItemT;
  index: number;
  separators: ISeparators;
}) => ReactNode;

// FlatList's imperative handle is exactly VirtualizedList's: scrollTo* forwarded
// down to the underlying list.
export type IFlatListHandle = IVirtualizedListHandle;

export type IFlatListProps<ItemT> = IAccessibilityProps &
  IAriaProps & {
    data: readonly ItemT[];
    renderItem: IRenderItem<ItemT>;
    keyExtractor?: (item: ItemT, index: number) => string;
    getItemLayout?: (
      data: unknown,
      index: number,
    ) => { length: number; offset: number; index: number };
    numColumns?: number;
    // Style for the auto-generated row View when numColumns > 1 (RN's columnWrapperStyle). A bare
    // string resolves through the shared style registry, like `className` below.
    columnWrapperStyle?: IStyleProp<IViewStyle> | string;
    ItemSeparatorComponent?: ComponentType<ISeparatorProps<ItemT>>;
    // The cell's `item` is the list's own, a row of items when `numColumns` is above 1
    CellRendererComponent?: ICellRendererComponent<unknown>;
    ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement;
    ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement;
    ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement;
    ListHeaderComponentStyle?: IStyleProp<IViewStyle>;
    ListFooterComponentStyle?: IStyleProp<IViewStyle>;
    horizontal?: boolean;
    inverted?: boolean;
    extraData?: unknown;
    onEndReached?: (info: { distanceFromEnd: number }) => void;
    onEndReachedThreshold?: number;
    onStartReached?: (info: { distanceFromStart: number }) => void;
    onStartReachedThreshold?: number;
    onRefresh?: () => void;
    refreshing?: boolean | null;
    progressViewOffset?: number;
    onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
    viewabilityConfig?: IViewabilityConfig;
    viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
    onScrollToIndexFailed?: (info: {
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    }) => void;
    initialNumToRender?: number;
    initialScrollIndex?: number;
    maxToRenderPerBatch?: number;
    updateCellsBatchingPeriod?: number;
    windowSize?: number;
    disableVirtualization?: boolean;
    stickyHeaderIndices?: number[];
    maintainVisibleContentPosition?: {
      minIndexForVisible: number;
      autoscrollToTopThreshold?: number;
    };
    onScroll?: (event: ISymbioteEvent) => void;
    onScrollBeginDrag?: (event: ISymbioteEvent) => void;
    onScrollEndDrag?: (event: ISymbioteEvent) => void;
    onMomentumScrollBegin?: (event: ISymbioteEvent) => void;
    onMomentumScrollEnd?: (event: ISymbioteEvent) => void;
    onContentSizeChange?: (width: number, height: number) => void;
    scrollEventThrottle?: number;
    keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
    keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
    style?: IStyleProp<IViewStyle>;
    contentContainerStyle?: IStyleProp<IViewStyle>;
    // Forwarded onto the inner VirtualizedList like `style` — resolves through the shared style
    // registry.
    className?: string;
    // RN defaults it per platform (true on Android); see removeClippedSubviewsOrDefault.
    removeClippedSubviews?: boolean;
    nestedScrollEnabled?: boolean;
    stickyHeaderHiddenOnScroll?: boolean;
    innerViewRef?: IInnerViewRef;
  };

// Props typed on `ItemT`: the multi-column stream is `IRow<ItemT>`, so they are rewrapped there
type IItemTyped<ItemT> = Pick<
  IFlatListProps<ItemT>,
  | 'data'
  | 'renderItem'
  | 'keyExtractor'
  | 'numColumns'
  | 'columnWrapperStyle'
  | 'onViewableItemsChanged'
  | 'viewabilityConfigCallbackPairs'
  | 'ItemSeparatorComponent'
>;
type IPassthrough<ItemT> = Omit<IFlatListProps<ItemT>, keyof IItemTyped<ItemT>>;

function singleColumnList<ItemT>(
  typed: IItemTyped<ItemT>,
  rest: IPassthrough<ItemT>,
  ref: Ref<IFlatListHandle> | undefined,
): ReactElement {
  const { data } = typed;
  return createElement(VirtualizedList<ItemT>, {
    ref,
    getItem: (_source: unknown, index: number): ItemT => data[index],
    getItemCount: (): number => arrayLikeLength(data),
    renderItem: typed.renderItem,
    keyExtractor: typed.keyExtractor,
    onViewableItemsChanged: typed.onViewableItemsChanged,
    viewabilityConfigCallbackPairs: typed.viewabilityConfigCallbackPairs,
    ItemSeparatorComponent: typed.ItemSeparatorComponent,
    data,
    ...rest,
  });
}

// The row is the virtualized cell, so its items share one `separators` handle, as in RN
function rowRenderer<ItemT>(
  typed: IItemTyped<ItemT>,
): (info: {
  item: IRow<ItemT>;
  index: number;
  separators: ISeparators;
}) => ReactNode {
  const { renderItem, keyExtractor, columnWrapperStyle } = typed;
  const rowStyle: IStyleProp<IViewStyle> = [
    { flexDirection: 'row' },
    typeof columnWrapperStyle === 'string'
      ? resolveClassName(columnWrapperStyle)
      : columnWrapperStyle,
  ];
  return info => {
    const cells = expandRowToken(
      { item: info.item, key: '', index: info.index, isViewable: true },
      keyExtractor,
    ).map(({ item, index, key }) =>
      createElement(
        'view',
        { key, style: { flex: 1 } },
        renderItem({ item, index, separators: info.separators }),
      ),
    );
    return createElement('view', { style: rowStyle }, ...cells);
  };
}

// Row reports expand back to per-item tokens through `expandRowViewability`
function rowViewability<ItemT>(typed: IItemTyped<ItemT>): {
  onViewableItemsChanged:
    ((info: IViewableItemsChangedInfo<IRow<ItemT>>) => void) | undefined;
  pairs: IViewabilityConfigCallbackPair<IRow<ItemT>>[] | undefined;
} {
  const { keyExtractor, onViewableItemsChanged } = typed;
  const expand =
    (report: (info: IViewableItemsChangedInfo<ItemT>) => void) =>
    (rowInfo: IViewableItemsChangedInfo<IRow<ItemT>>): void => {
      report(expandRowViewability(rowInfo, keyExtractor));
    };
  return {
    onViewableItemsChanged:
      onViewableItemsChanged === undefined
        ? undefined
        : expand(onViewableItemsChanged),
    pairs: typed.viewabilityConfigCallbackPairs?.map(pair => ({
      viewabilityConfig: pair.viewabilityConfig,
      onViewableItemsChanged: expand(pair.onViewableItemsChanged),
    })),
  };
}

// The divider between rows shows the last item above and the first below, not the `IRow`
function rowSeparator<ItemT>(
  separator: IItemTyped<ItemT>['ItemSeparatorComponent'],
): ComponentType<ISeparatorProps<IRow<ItemT>>> | undefined {
  if (separator === undefined) return undefined;
  return (rowProps): ReactNode =>
    createElement(separator, {
      ...rowProps,
      leadingItem: lastItemOfRow(rowProps.leadingItem),
      trailingItem: firstItemOfRow(rowProps.trailingItem),
    });
}

// The virtualized stream is rows, each cell lays its items out side by side in a flex row
function multiColumnList<ItemT>(
  typed: IItemTyped<ItemT>,
  numColumns: number,
  rest: IPassthrough<ItemT>,
  ref: Ref<IFlatListHandle> | undefined,
): ReactElement {
  const rows = chunkIntoRows(typed.data, numColumns);
  const viewability = rowViewability(typed);
  return createElement(VirtualizedList<IRow<ItemT>>, {
    ref,
    data: rows,
    getItem: (_source: unknown, index: number): IRow<ItemT> => rows[index],
    getItemCount: (): number => rows.length,
    renderItem: rowRenderer(typed),
    keyExtractor: (row: IRow<ItemT>): string =>
      rowKeyExtractor(row, typed.keyExtractor),
    onViewableItemsChanged: viewability.onViewableItemsChanged,
    viewabilityConfigCallbackPairs: viewability.pairs,
    ItemSeparatorComponent: rowSeparator(typed.ItemSeparatorComponent),
    ...rest,
  });
}

export function FlatList<ItemT>(
  props: IFlatListProps<ItemT> & { ref?: Ref<IFlatListHandle> },
): ReactElement {
  const {
    ref,
    data,
    renderItem,
    keyExtractor,
    numColumns = SINGLE_COLUMN,
    columnWrapperStyle,
    onViewableItemsChanged,
    viewabilityConfigCallbackPairs,
    ItemSeparatorComponent,
    removeClippedSubviews: authoredRemoveClippedSubviews,
    ...ownRest
  } = props;
  // `FlatList.js` always sends it, defaulted per platform
  const rest = {
    ...ownRest,
    removeClippedSubviews: removeClippedSubviewsOrDefault(
      authoredRemoveClippedSubviews,
      Platform.OS,
    ),
  };
  const typed: IItemTyped<ItemT> = {
    data,
    renderItem,
    keyExtractor,
    numColumns,
    columnWrapperStyle,
    onViewableItemsChanged,
    viewabilityConfigCallbackPairs,
    ItemSeparatorComponent,
  };

  dlog(`FlatList over ${arrayLikeLength(data)} items, ${numColumns} column(s)`);

  return numColumns <= SINGLE_COLUMN
    ? singleColumnList(typed, rest, ref)
    : multiColumnList(typed, numColumns, rest, ref);
}
