// The props snapshot the list lifecycle works against: defaults applied, slots resolved, native
// listeners turned into emit bridges

import type { Component, VNode } from '@vue/runtime-core';
import {
  DEFAULT_INITIAL_NUM_TO_RENDER,
  DEFAULT_MAX_TO_RENDER_PER_BATCH,
  DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
  DEFAULT_WINDOW_SIZE,
  type IViewableItemsChangedInfo,
  type IViewabilityConfig,
  type IViewabilityConfigCallbackPair,
  type ISeparators,
} from '@symbiote-native/components';
import type {
  IStyleProp,
  ISymbioteEvent,
  IViewStyle,
} from '@symbiote-native/engine';
import { normalizeVueAttrs } from '../../utils/normalize-attrs';
import { componentFromSlot } from '../../utils/slots-to-render-props';
import type {
  IVirtualizedListEmits,
  IVirtualizedListProps,
  IVirtualizedListSlots,
} from './virtualized-list-props';

type IRenderItem<ItemT> = (info: {
  item: ItemT;
  index: number;
  separators: ISeparators;
}) => VNode | VNode[] | undefined;

type IScrollHandler = (event: ISymbioteEvent) => void;

type IScrollToIndexFailedInfo = {
  index: number;
  highestMeasuredFrameIndex: number;
  averageItemLength: number;
};

export type INarrowedProps<ItemT> = {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  // Absent when the consumer gave no `#item` slot, the render logs instead of throwing
  renderItem?: IRenderItem<ItemT>;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  itemSeparatorComponent?: Component;
  cellRendererComponent?: Component;
  listHeaderComponent?: unknown;
  listFooterComponent?: unknown;
  listEmptyComponent?: unknown;
  horizontal: boolean;
  inverted: boolean;
  onEndReached?: (info: { distanceFromEnd: number }) => void;
  onEndReachedThreshold?: number;
  onStartReached?: (info: { distanceFromStart: number }) => void;
  onStartReachedThreshold?: number;
  onRefresh?: () => void;
  refreshing: boolean;
  progressViewOffset?: number;
  onViewableItemsChanged?: (info: IViewableItemsChangedInfo<ItemT>) => void;
  viewabilityConfig?: IViewabilityConfig;
  viewabilityConfigCallbackPairs?: IViewabilityConfigCallbackPair<ItemT>[];
  onScrollToIndexFailed?: (info: IScrollToIndexFailedInfo) => void;
  initialNumToRender: number;
  initialScrollIndex?: number;
  maxToRenderPerBatch: number;
  updateCellsBatchingPeriod: number;
  windowSize: number;
  disableVirtualization: boolean;
  stickyHeaderIndices?: number[];
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  userOnScroll?: IScrollHandler;
  style?: IStyleProp<IViewStyle>;
  contentContainerStyle?: IStyleProp<IViewStyle>;
  listHeaderComponentStyle?: IStyleProp<IViewStyle>;
  listFooterComponentStyle?: IStyleProp<IViewStyle>;
  keyboardShouldPersistTaps?: boolean | 'always' | 'never' | 'handled';
  keyboardDismissMode?: 'none' | 'on-drag' | 'interactive';
  // Raw scroll callbacks, throttle, accessibility and the rest ride onto the ScrollView
  forwarded: Record<string, unknown>;
};

export type INarrowSource<ItemT> = {
  props: IVirtualizedListProps<ItemT>;
  attrs: Record<string, unknown>;
  slots: IVirtualizedListSlots<ItemT>;
  emit: <K extends keyof IVirtualizedListEmits<ItemT>>(
    event: K,
    ...args: Parameters<IVirtualizedListEmits<ItemT>[K]>
  ) => void;
  // Whether the parent passed an `onX` listener, Vue strips the five list events from `$attrs`
  listens: (onName: string) => boolean;
};

type IUnknownHandler = (...args: readonly unknown[]) => unknown;

function isHandler(value: unknown): value is IUnknownHandler {
  return typeof value === 'function';
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

// The list composes `onScroll` and `onLayout` itself, a consumer-passed one is re-set there
function forwardAttrs(attrs: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    if (key !== 'onScroll' && key !== 'onLayout') result[key] = attrs[key];
  }
  return result;
}

// Each bridge exists only when the consumer listens, so a list builds RefreshControl and computes
// viewability strictly on demand
function emitBridges<ItemT>(
  source: INarrowSource<ItemT>,
): Pick<
  INarrowedProps<ItemT>,
  | 'onEndReached'
  | 'onStartReached'
  | 'onRefresh'
  | 'onViewableItemsChanged'
  | 'onScrollToIndexFailed'
> {
  const { emit, listens } = source;
  return {
    onEndReached: listens('onEndReached')
      ? info => emit('endReached', info)
      : undefined,
    onStartReached: listens('onStartReached')
      ? info => emit('startReached', info)
      : undefined,
    onRefresh: listens('onRefresh') ? () => emit('refresh') : undefined,
    onViewableItemsChanged: listens('onViewableItemsChanged')
      ? info => emit('viewableItemsChanged', info)
      : undefined,
    onScrollToIndexFailed: listens('onScrollToIndexFailed')
      ? info => emit('scrollToIndexFailed', info)
      : undefined,
  };
}

export function narrowProps<ItemT>(
  source: INarrowSource<ItemT>,
): INarrowedProps<ItemT> {
  const { props, slots } = source;
  const folded = normalizeVueAttrs(source.attrs);
  return {
    ...emitBridges(source),
    data: props.data,
    getItem: props.getItem,
    getItemCount: props.getItemCount,
    // `#item` IS the render fn, `#separator` carries scope props so it becomes a component, the
    // scopeless header, footer and empty slots are handed over bare
    renderItem: slots.item,
    keyExtractor: props.keyExtractor,
    getItemLayout: props.getItemLayout,
    itemSeparatorComponent: componentFromSlot(slots.separator),
    cellRendererComponent: props.cellRendererComponent,
    listHeaderComponent: slots.header,
    listFooterComponent: slots.footer,
    listEmptyComponent: slots.empty,
    horizontal: props.horizontal === true,
    inverted: props.inverted === true,
    onEndReachedThreshold:
      typeof props.onEndReachedThreshold === 'number'
        ? props.onEndReachedThreshold
        : undefined,
    onStartReachedThreshold:
      typeof props.onStartReachedThreshold === 'number'
        ? props.onStartReachedThreshold
        : undefined,
    refreshing: props.refreshing === true,
    progressViewOffset: props.progressViewOffset,
    viewabilityConfig: props.viewabilityConfig,
    viewabilityConfigCallbackPairs: props.viewabilityConfigCallbackPairs,
    initialNumToRender: asNumber(
      props.initialNumToRender,
      DEFAULT_INITIAL_NUM_TO_RENDER,
    ),
    initialScrollIndex: props.initialScrollIndex,
    maxToRenderPerBatch: asNumber(
      props.maxToRenderPerBatch,
      DEFAULT_MAX_TO_RENDER_PER_BATCH,
    ),
    updateCellsBatchingPeriod: asNumber(
      props.updateCellsBatchingPeriod,
      DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
    ),
    windowSize: asNumber(props.windowSize, DEFAULT_WINDOW_SIZE),
    disableVirtualization: props.disableVirtualization === true,
    stickyHeaderIndices: props.stickyHeaderIndices,
    maintainVisibleContentPosition: props.maintainVisibleContentPosition,
    userOnScroll: isHandler(folded.onScroll) ? folded.onScroll : undefined,
    style: props.style,
    contentContainerStyle: props.contentContainerStyle,
    listHeaderComponentStyle: props.listHeaderComponentStyle,
    listFooterComponentStyle: props.listFooterComponentStyle,
    keyboardShouldPersistTaps: props.keyboardShouldPersistTaps,
    keyboardDismissMode: props.keyboardDismissMode,
    forwarded: forwardAttrs(folded),
  };
}
