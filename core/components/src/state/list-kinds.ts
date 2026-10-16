// Names for the `kind` discriminants of the list reducer's actions and effects, so an adapter
// compares against a constant instead of repeating the string. `satisfies` keeps each value a
// real member of the union, a renamed kind stops compiling here

import type { IListAction, IListEffect } from './virtualized-list-reducer';

export const LIST_ACTION_KIND = {
  scroll: 'scroll',
  layout: 'layout',
  contentSize: 'content-size',
  parentScroll: 'parent-scroll',
  parentLayout: 'parent-layout',
  measure: 'measure',
  refreshMetrics: 'refresh-metrics',
  batchTick: 'batch-tick',
  recordInteraction: 'record-interaction',
  viewableDue: 'viewable-due',
  cellFocused: 'cell-focused',
  commit: 'commit',
  scrollToOffset: 'scroll-to-offset',
  scrollToIndex: 'scroll-to-index',
  scrollToItem: 'scroll-to-item',
  scrollToEnd: 'scroll-to-end',
} as const satisfies Record<string, IListAction<unknown>['kind']>;

export const LIST_EFFECT_KIND = {
  scrollTo: 'scroll-to',
  fireEndReached: 'fire-end-reached',
  fireStartReached: 'fire-start-reached',
  fireViewable: 'fire-viewable',
  scheduleViewable: 'schedule-viewable',
  scheduleRefill: 'schedule-refill',
  fireScrollToIndexFailed: 'fire-scroll-to-index-failed',
} as const satisfies Record<string, IListEffect<unknown>['kind']>;
