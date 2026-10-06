// State, config, action and effect shapes of the list reducer

import type { ICellLayout } from './list-types';
import type {
  IViewableItemsChangedInfo,
  IViewabilityConfigCallbackPair,
  IViewToken,
} from './list-viewability';
import type { IRenderRange } from './virtualize-utils';

// Derived window snapshot, read straight by the adapter's render
// `fixedLayout` is the wrapped `getItemLayout`, undefined when the list measures cells itself
export type IListMetrics = {
  count: number;
  offsets: number[];
  lengths: number[];
  total: number;
  first: number;
  last: number;
  // The window first, then regions retained outside it (the initial render kept for scroll-to-top)
  regions: IRenderRange[];
  // Where the window settles once every batch has landed
  target: IRenderRange;
  averageLength: number;
  fixedLayout: ((index: number) => ICellLayout) | undefined;
  // Where the tail spacer stops, the highest measured cell, undefined when `getItemLayout` sizes it
  tailLimit: number | undefined;
  // False under `disableVirtualization`: the plan paints no spacer node
  hasSpacers: boolean;
};

// Everything `buildOffsets` read, so an unchanged frame can reuse the table
export type IOffsetsCache = {
  count: number;
  data: unknown;
  getItemLayout: unknown;
  averageLength: number;
  averageStride: number;
  measureVersion: number;
  offsets: number[];
  lengths: number[];
  total: number;
};

// The folded list state, the adapter holds ONE reference and re-reads it after each `reduceList`
// The maps are mutated in place, they were ref-backed and never render state
export type IListState<ItemT> = {
  scrollOffset: number;
  viewportLength: number;
  // Where a nested list starts inside the parent's scroll content, 0 for a list that scrolls itself
  offsetFromParent: number;
  // A nested list's own content length as the last `parent-layout` measured it, 0 until then
  nestedContentLength: number;
  // The scroll content's length from `onContentSizeChange`, undefined until it is laid out
  // RTL turns it into flow-relative offsets and back, RN's `ListMetricsAggregator._contentLength`
  contentLength: number | undefined;
  measured: Map<number, number>;
  // Raw host offset per measured cell, stored verbatim beside its length
  measuredOffsets: Map<number, number>;
  // RN's `_lastFocusedCellKey` with the index it had, it stays after a blur like in RN
  focusedCell: { index: number; key: string } | null;
  // RN's `_highestMeasuredCellIndex`, 0 until something is measured, it never goes back down
  highestMeasuredIndex: number;
  // The key each measurement was taken for, a prepend moves keys under the indices above
  measuredKeys: Map<number, string>;
  // Indices whose measurement belongs to another key now, ignored like RN's index mismatch
  staleMeasured: Set<number>;
  // The data the stale set was last checked against
  measuredData: unknown;
  // Bumped by the only two writers of the maps above, in place mutation hides identity changes
  measureVersion: number;
  // `buildOffsets` walks the whole list and runs every scroll frame
  // Kept in state, not at module level, so two lists cannot evict each other
  offsetsCache: IOffsetsCache | null;
  committedWindow: IRenderRange;
  // The batching timer fired and its render may grow the overscan, one derive spends it (RN)
  isBatchDue: boolean;
  // The first derive paints the initial region, a later empty-to-data change starts empty (RN)
  isWindowSeeded: boolean;
  // Offset change per millisecond between the last two scroll events, steers which side fills first
  scrollVelocity: number;
  scrollTimestamp: number | undefined;
  // Scroll events still owed before the scroll metrics are trusted, 1 when the list opens past 0
  pendingScrollUpdates: number;
  sentEndForContentLength: number;
  sentStartForContentLength: number;
  // The last set each viewability pair reported, by pair index
  lastViewable: Map<string, IViewToken<ItemT>>[];
  // RN's `_viewableIndices` per pair, a repeat of the same indices reports nothing
  viewableIndices: number[][];
  // Indices are position-based, so new data resets them and every report is diffed again
  viewabilityData: unknown;
  hasInteracted: boolean;
  firstVisibleKey: string | null;
  appliedInitialScroll: boolean;
  metrics: IListMetrics;
};

// Config read on each call, the edge and viewability CALLBACKS never reach the reducer
// Only whether a listener is active and the viewability pairs do, the adapter fires the callbacks
export type IListReducerInputs<ItemT> = {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  getItemCount: (data: unknown) => number;
  keyExtractor?: (item: ItemT, index: number) => string;
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number };
  horizontal: boolean;
  // RN reads `I18nManager.isRTL`: a horizontal list then counts offsets from the right edge
  rtl?: boolean;
  windowSize: number;
  initialNumToRender: number;
  maxToRenderPerBatch: number;
  updateCellsBatchingPeriod: number;
  onEndReachedThreshold: number | undefined;
  onStartReachedThreshold: number | undefined;
  onEndReachedActive: boolean;
  onStartReachedActive: boolean;
  viewabilityPairs: IViewabilityConfigCallbackPair<ItemT>[];
  maintainVisibleContentPosition?: {
    minIndexForVisible: number;
    autoscrollToTopThreshold?: number;
  };
  initialScrollIndex?: number;
  // Every cell above the window stays mounted and no spacer stands in for the unrendered ones
  disableVirtualization?: boolean;
  // The first index in `[first, last]` whose cell holds a nested list with more to render
  // The window stops there so child lists get to render before the parent mounts further cells
  findFirstChildWithMore?: (first: number, last: number) => number | null;
};

// What the adapter turns native callbacks and imperative calls into
// `commit` is the after-render pass, `viewable-fired` folds a finished debounce into
// `lastViewable`, `batch-tick` is the refill timer firing
export type IListAction<ItemT> =
  // Without a `timestamp` the interval counts as 1ms, as RN does for an event with no `timeStamp`
  | { kind: 'scroll'; offset: number; timestamp?: number }
  | { kind: 'layout'; length: number }
  // The scroll content's own length, from the scroll view's `onContentSizeChange`
  | { kind: 'content-size'; length: number }
  // A nested list reads the parent's scroll: its own offset is the parent's minus where it sits
  | {
      kind: 'parent-scroll';
      offset: number;
      visibleLength: number;
      timestamp?: number;
    }
  // Where the nested list sits in the parent's scroll content and how long its own content is
  | { kind: 'parent-layout'; offsetFromParent: number; contentLength: number }
  // `offset` is the cell's raw y or x read at the same `onLayout` as `length`
  // Optional, without it positions stay estimates and the chrome between cells goes uncounted
  | { kind: 'measure'; index: number; length: number; offset?: number }
  | { kind: 'refresh-metrics' }
  | { kind: 'batch-tick' }
  | { kind: 'record-interaction' }
  | { kind: 'viewable-due'; pairIndex: number; indices: number[] }
  // Focus landed inside the cell at `index`, RN keeps a viewport around it mounted
  | { kind: 'cell-focused'; index: number }
  | { kind: 'commit' }
  | { kind: 'scroll-to-offset'; offset: number; animated: boolean }
  | {
      kind: 'scroll-to-index';
      index: number;
      animated: boolean;
      viewPosition: number;
      viewOffset: number;
      // The length of this cell joins `viewOffset`, a sticky section header covering the target
      offsetByCellLength?: number;
    }
  | {
      kind: 'scroll-to-item';
      item: unknown;
      animated: boolean;
      viewPosition: number;
    }
  | { kind: 'scroll-to-end'; animated: boolean };

// The work the adapter executes with its own primitives
// `fire-viewable` is one pair's report, `schedule-viewable` asks for a `viewable-due` action after
// the pair's `minimumViewTime`, carrying the indices that were viewable when it was asked
export type IListEffect<ItemT> =
  | { kind: 'scroll-to'; offset: number; animated: boolean }
  | { kind: 'fire-end-reached'; distanceFromEnd: number }
  | { kind: 'fire-start-reached'; distanceFromStart: number }
  | {
      kind: 'fire-viewable';
      pairIndex: number;
      info: IViewableItemsChangedInfo<ItemT>;
    }
  | {
      kind: 'schedule-viewable';
      pairIndex: number;
      indices: number[];
      delay: number;
    }
  | { kind: 'schedule-refill'; delay: number }
  | {
      kind: 'fire-scroll-to-index-failed';
      index: number;
      highestMeasuredFrameIndex: number;
      averageItemLength: number;
    };

export type IListReduceResult<ItemT> = {
  state: IListState<ItemT>;
  effects: IListEffect<ItemT>[];
  // Whether render-relevant state changed, a repeated known measure returns false
  changed: boolean;
};
