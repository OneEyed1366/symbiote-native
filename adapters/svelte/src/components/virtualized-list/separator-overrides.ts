// Kept apart from the list so its markup stays readable: one store for what a separator was told
// The plain Map has no reactivity, so every read goes through the host's version to re-track

import {
  buildSeparatorHandles,
  buildSeparatorProps,
  isSeparatorGapInRange,
  type ISeparatorProps,
  type ISeparators,
} from '@symbiote-native/components';

type ISeparatorHost<ItemT> = {
  count: () => number;
  itemAt: (index: number) => ItemT;
  version: () => number;
  bump: () => void;
};

type ISeparatorOverrides<ItemT> = {
  propsFor: (index: number) => ISeparatorProps<ItemT>;
  handlesFor: (index: number) => ISeparators;
};

export function createSeparatorOverrides<ItemT>(
  host: ISeparatorHost<ItemT>,
): ISeparatorOverrides<ItemT> {
  const overrides = new Map<number, Partial<ISeparatorProps<ItemT>>>();

  function merge(
    gapIndex: number,
    patch: Partial<ISeparatorProps<ItemT>>,
  ): void {
    if (!isSeparatorGapInRange(gapIndex, host.count())) return;
    overrides.set(gapIndex, { ...overrides.get(gapIndex), ...patch });
    host.bump();
  }

  return {
    propsFor(index) {
      void host.version();
      return buildSeparatorProps(
        host.itemAt(index),
        host.itemAt(index + 1),
        overrides.get(index),
      );
    },
    handlesFor: index => buildSeparatorHandles(index, merge),
  };
}
