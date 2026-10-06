// The props a separator receives, the same for every adapter

import type { ISeparatorProps } from './list-types';

export function buildSeparatorProps<ItemT>(
  leadingItem: ItemT,
  trailingItem: ItemT,
  overrides: Partial<ISeparatorProps<ItemT>> | undefined,
): ISeparatorProps<ItemT> {
  return { highlighted: false, leadingItem, trailingItem, ...overrides };
}
