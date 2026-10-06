// The plan for the window the driver derived, keyed so a row survives a window slide

import { createMemo, type Accessor } from 'solid-js';
import {
  FIRST_INDEX,
  LIST_SEGMENT_KIND,
  planFromMetrics,
  resolveItemKey,
  type IListMetrics,
  type IListSegment,
} from '@symbiote-native/components';
import type { IVirtualizedListProps } from './virtualized-list-props';

export type IListWindow = {
  // Undefined when the app flagged no sticky cells or the list is empty
  stickySet: Accessor<ReadonlySet<number> | undefined>;
  // <For> matches by VALUE identity, so it walks these keys and not the plan's fresh objects
  // A key that survives a window slide keeps its row's nodes and simply moves
  rowKeys: Accessor<string[]>;
  segmentOf: (rowKey: string) => IListSegment | undefined;
  mountedIndices: Accessor<ReadonlySet<number>>;
};

// A cell and a spacer never share a row key, an item key cannot start with `spacer-`
export function rowKeyOf(segment: IListSegment): string {
  return segment.kind === LIST_SEGMENT_KIND.spacer
    ? segment.key
    : `cell-${segment.key}`;
}

export function createListWindow<ItemT>(
  props: IVirtualizedListProps<ItemT>,
  metrics: Accessor<IListMetrics>,
): IListWindow {
  const keyFor = (index: number): string =>
    resolveItemKey(props.getItem(props.data, index), index, props.keyExtractor);
  const windowPlan = createMemo(() => {
    const current = metrics();
    if (current.count === FIRST_INDEX) return null;
    return planFromMetrics(current, keyFor, props.stickyHeaderIndices);
  });
  const segments = createMemo(() => windowPlan()?.plan.segments ?? []);
  const segmentsByKey = createMemo(
    () =>
      new Map(
        segments().map((segment): [string, IListSegment] => [
          rowKeyOf(segment),
          segment,
        ]),
      ),
  );
  return {
    stickySet: () => windowPlan()?.stickySet,
    rowKeys: createMemo(() => segments().map(rowKeyOf)),
    segmentOf: rowKey => segmentsByKey().get(rowKey),
    mountedIndices: createMemo(
      () =>
        new Set(
          segments().flatMap(segment =>
            segment.kind === LIST_SEGMENT_KIND.cell ? [segment.index] : [],
          ),
        ),
    ),
  };
}
