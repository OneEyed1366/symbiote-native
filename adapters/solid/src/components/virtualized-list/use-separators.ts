// Per-gap separator overrides, read straight by the cell walk

import { createSignal } from 'solid-js';
import {
  buildSeparatorHandles,
  buildSeparatorProps,
  isSeparatorGapInRange,
  type ISeparatorProps,
  type ISeparators,
} from '@symbiote-native/components';
import type { IVirtualizedListProps } from './virtualized-list-props';

export type IListSeparators<ItemT> = {
  makeSeparators: (index: number) => ISeparators;
  separatorPropsFor: (index: number) => ISeparatorProps<ItemT>;
};

// Keyed by the leading cell index of the gap, a gap outside [0, count - 2] addresses no separator
export function createSeparators<ItemT>(
  props: IVirtualizedListProps<ItemT>,
  currentCount: () => number,
): IListSeparators<ItemT> {
  const overrides = new Map<number, Partial<ISeparatorProps<ItemT>>>();
  const [version, setVersion] = createSignal(0);
  const mergeSeparator = (
    gapIndex: number,
    patch: Partial<ISeparatorProps<ItemT>>,
  ): void => {
    if (!isSeparatorGapInRange(gapIndex, currentCount())) return;
    overrides.set(gapIndex, { ...overrides.get(gapIndex), ...patch });
    setVersion(tick => tick + 1);
  };
  return {
    makeSeparators: index => buildSeparatorHandles(index, mergeSeparator),
    // Reads `version` so a highlight call reactively refreshes this gap, the Map tracks nothing
    separatorPropsFor: index => {
      version();
      return buildSeparatorProps(
        props.getItem(props.data, index),
        props.getItem(props.data, index + 1),
        overrides.get(index),
      );
    },
  };
}
