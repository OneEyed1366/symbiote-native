// Per-gap separator overrides, render state read straight by the cell walk

import { useCallback, useRef, useState, type RefObject } from 'react';
import {
  EMPTY_OFFSET,
  buildSeparatorHandles,
  isSeparatorGapInRange,
  type ISeparatorProps,
  type ISeparators,
} from '@symbiote-native/components';

export type ISeparatorOverrides<ItemT> = Map<
  number,
  Partial<ISeparatorProps<ItemT>>
>;

export type IListSeparators<ItemT> = {
  // Keyed by the LEADING cell index of the gap
  overridesRef: RefObject<ISeparatorOverrides<ItemT>>;
  makeSeparators: (index: number) => ISeparators;
};

export function useSeparators<ItemT>(count: number): IListSeparators<ItemT> {
  const overridesRef = useRef<ISeparatorOverrides<ItemT>>(new Map());
  const [, setVersion] = useState(EMPTY_OFFSET);

  // A gap outside [0, count - 2] has no separator, so the write is a no-op, RN bails the same way
  const mergeSeparator = useCallback(
    (gapIndex: number, patch: Partial<ISeparatorProps<ItemT>>): void => {
      if (!isSeparatorGapInRange(gapIndex, count)) return;
      const overrides = overridesRef.current;
      overrides.set(gapIndex, { ...overrides.get(gapIndex), ...patch });
      setVersion(version => version + 1);
    },
    [count],
  );

  const makeSeparators = useCallback(
    (index: number): ISeparators =>
      buildSeparatorHandles(index, mergeSeparator),
    [mergeSeparator],
  );
  return { overridesRef, makeSeparators };
}
