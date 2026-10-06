// Item identity for the list state: keys and index lookup

import { FIRST_INDEX, NO_INDEX } from './list-constants';

// RN's default, an object item's own `key`, else its `id`, else the index
// The index alone breaks identity on a swap, so apps rely on this
export function defaultKeyExtractor<ItemT>(item: ItemT, index: number): string {
  if (typeof item === 'object' && item !== null) {
    const key: unknown = Reflect.get(item, 'key');
    if (key !== undefined && key !== null) return String(key);
    const id: unknown = Reflect.get(item, 'id');
    if (id !== undefined && id !== null) return String(id);
  }
  return String(index);
}

// One place for every adapter's `keyForIndex`: the caller's extractor, else the default
export function resolveItemKey<ItemT>(
  item: ItemT,
  index: number,
  keyExtractor: ((item: ItemT, index: number) => string) | undefined,
): string {
  return (keyExtractor ?? defaultKeyExtractor)(item, index);
}

type IKeyedInputs<ItemT> = {
  data: unknown;
  getItem: (data: unknown, index: number) => ItemT;
  keyExtractor?: (item: ItemT, index: number) => string;
};

// The key of the cell at an index, the extractor sees the item exactly as the list renders it
export function keyForOf<ItemT>(
  inputs: IKeyedInputs<ItemT>,
): (index: number) => string {
  return (index: number): string =>
    resolveItemKey(
      inputs.getItem(inputs.data, index),
      index,
      inputs.keyExtractor,
    );
}

// Linear lookup by reference identity for `scrollToItem`, NO_INDEX when the item is absent
export function indexOfItem(
  data: unknown,
  getItem: (data: unknown, index: number) => unknown,
  count: number,
  item: unknown,
): number {
  for (let index = FIRST_INDEX; index < count; index += 1) {
    if (getItem(data, index) === item) return index;
  }
  return NO_INDEX;
}
