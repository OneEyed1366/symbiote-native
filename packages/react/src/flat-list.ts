// FlatList — the convenience surface over VirtualizedList. It takes a plain
// `data` array and derives getItem/getItemCount, so callers never touch the
// VirtualizedList data-access protocol. `numColumns` packs that many items into
// each row (a horizontal sub-View), so the virtualized stream is rows, not items
// — matching RN's FlatList behavior. All windowing is inherited; this file only
// adapts the data shape and grouping.

import { createElement, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { dlog } from '@symbiote/shared'
import { VirtualizedList } from './virtualized-list'
import type { ViewStyle } from './styles'

const SINGLE_COLUMN = 1

type RenderItem<ItemT> = (info: { item: ItemT; index: number }) => ReactNode

export interface FlatListProps<ItemT> {
  data: readonly ItemT[]
  renderItem: RenderItem<ItemT>
  keyExtractor?: (item: ItemT, index: number) => string
  getItemLayout?: (
    data: unknown,
    index: number,
  ) => { length: number; offset: number; index: number }
  numColumns?: number
  ItemSeparatorComponent?: ComponentType<Record<string, never>>
  ListHeaderComponent?: ComponentType<Record<string, never>> | ReactElement
  ListFooterComponent?: ComponentType<Record<string, never>> | ReactElement
  ListEmptyComponent?: ComponentType<Record<string, never>> | ReactElement
  horizontal?: boolean
  onEndReached?: (info: { distanceFromEnd: number }) => void
  onEndReachedThreshold?: number
  initialNumToRender?: number
  windowSize?: number
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
}

// A row is the slice of items packed into one virtualized cell when numColumns>1.
interface Row<ItemT> {
  items: ItemT[]
  startIndex: number
}

function chunkIntoRows<ItemT>(data: readonly ItemT[], columns: number): Row<ItemT>[] {
  const rows: Row<ItemT>[] = []
  for (let start = 0; start < data.length; start += columns) {
    rows.push({ items: data.slice(start, start + columns), startIndex: start })
  }
  return rows
}

export function FlatList<ItemT>(props: FlatListProps<ItemT>): ReactElement {
  const {
    data,
    renderItem,
    keyExtractor,
    numColumns = SINGLE_COLUMN,
    ...rest
  } = props

  dlog(`FlatList over ${data.length} items, ${numColumns} column(s)`)

  if (numColumns <= SINGLE_COLUMN) {
    return createElement(VirtualizedList<ItemT>, {
      data,
      getItem: (source: unknown, index: number): ItemT => data[index],
      getItemCount: (): number => data.length,
      renderItem,
      keyExtractor,
      ...rest,
    })
  }

  // Multi-column: the virtualized stream is rows. Each cell renders its items
  // side by side in a flex-row View so windowing accounts for whole rows.
  const rows = chunkIntoRows(data, numColumns)
  const rowStyle: ViewStyle = { flexDirection: 'row' }

  const renderRow = (info: { item: Row<ItemT>; index: number }): ReactNode => {
    const cells = info.item.items.map((item, column) => {
      const index = info.item.startIndex + column
      const key = keyExtractor ? keyExtractor(item, index) : String(index)
      return createElement('symbiote-view', { key, style: { flex: 1 } }, renderItem({ item, index }))
    })
    return createElement('symbiote-view', { style: rowStyle }, ...cells)
  }

  const rowKeyExtractor = (row: Row<ItemT>): string => `row-${row.startIndex}`

  return createElement(VirtualizedList<Row<ItemT>>, {
    data: rows,
    getItem: (source: unknown, index: number): Row<ItemT> => rows[index],
    getItemCount: (): number => rows.length,
    renderItem: renderRow,
    keyExtractor: rowKeyExtractor,
    ...rest,
  })
}
