// FlatList logic: the framework-agnostic data adaptation over VirtualizedList. A plain
// `data` array becomes getItem/getItemCount; numColumns packs items into rows so the
// virtualized stream is rows, not items (RN's FlatList). Viewability over rows expands
// back to per-item tokens, and the row separator unwraps to the flanking items. All of
// this is pure transform — every adapter (React, Vue) reuses it; the adapter supplies
// only the element creation (createElement / h) for a row and the ref wiring.

import {
  defaultKeyExtractor,
  type IViewableItemsChangedInfo,
  type IViewToken,
} from './virtualized-list';

export const SINGLE_COLUMN = 1;

// A row is the slice of items packed into one virtualized cell when numColumns > 1.
export interface IRow<ItemT> {
  items: ItemT[];
  startIndex: number;
}

export function chunkIntoRows<ItemT>(
  data: readonly ItemT[],
  columns: number,
): IRow<ItemT>[] {
  const rows: IRow<ItemT>[] = [];
  for (let start = 0; start < data.length; start += columns) {
    rows.push({ items: data.slice(start, start + columns), startIndex: start });
  }
  return rows;
}

// RN's own multi-column row key (`FlatList.js`'s `_keyExtractor`): each item's own key, joined
// with `:`, never a synthetic position string — an app's `keyExtractor` (or the object's own
// `key`/`id`) is what keeps a row's identity stable across inserts/removes, and a `row-${index}`
// key defeats that as surely as no key at all.
export function rowKeyExtractor<ItemT>(
  row: IRow<ItemT>,
  keyExtractor?: (item: ItemT, index: number) => string,
): string {
  const resolve = keyExtractor ?? defaultKeyExtractor;
  return row.items
    .map((item, column) => resolve(item, row.startIndex + column))
    .join(':');
}

// Expand a row's viewable token to one token per item in that row, all sharing the row's
// isViewable flag, so the caller sees item-level visibility rather than row-level.
export function expandRowToken<ItemT>(
  token: IViewToken<IRow<ItemT>>,
  keyExtractor?: (item: ItemT, index: number) => string,
): IViewToken<ItemT>[] {
  return token.item.items.map((item, column) => {
    const index = token.item.startIndex + column;
    const key = keyExtractor ? keyExtractor(item, index) : String(index);
    return { item, key, index, isViewable: token.isViewable };
  });
}

export function expandRowViewability<ItemT>(
  info: IViewableItemsChangedInfo<IRow<ItemT>>,
  keyExtractor?: (item: ItemT, index: number) => string,
): IViewableItemsChangedInfo<ItemT> {
  return {
    viewableItems: info.viewableItems.flatMap(token =>
      expandRowToken(token, keyExtractor),
    ),
    changed: info.changed.flatMap(token => expandRowToken(token, keyExtractor)),
  };
}

// The divider between rows shows real items, not the IRow wrapper: its leading item is the
// LAST item of the row above, its trailing item the FIRST item of the row below.
export function lastItemOfRow<ItemT>(
  row: IRow<ItemT> | undefined,
): ItemT | undefined {
  return row !== undefined ? row.items[row.items.length - 1] : undefined;
}

export function firstItemOfRow<ItemT>(
  row: IRow<ItemT> | undefined,
): ItemT | undefined {
  return row !== undefined ? row.items[0] : undefined;
}
