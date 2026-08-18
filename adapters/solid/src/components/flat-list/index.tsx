// FlatList — the convenience surface over VirtualizedList. It takes a plain `data` array and
// derives the getItem/getItemCount access protocol itself, so a caller never writes them, and
// `numColumns` packs that many items into each row so the virtualized stream is ROWS rather than
// items (RN's FlatList). Everything else — windowing, spacers, viewability, batching, sticky
// headers, pull-to-refresh, the imperative scrolls — is inherited from VirtualizedList; the data
// shaping and the row/viewability/separator transforms come from @symbiote-native/components and
// are shared verbatim with React, Vue, Svelte and Angular. This file adds Solid's lifecycle and
// nothing else.
//
// TWO SOLID FACTS SHAPE IT (.claude/rules/solid-descriptor-bridge.md):
//
// 1. `renderItem` takes an ACCESSOR, matching this adapter's VirtualizedList and diverging from
//    React's snapshot signature. Solid has no reconciler under the render prop, so a value would
//    freeze the row at its mount-time item.
// 2. The columns inside a packed row ride an <Index>, not a <For>. That is the exact MIRROR of
//    VirtualizedList's choice and for the same reason read the other way round: a cell key moves
//    between rows as the window slides, so the CELLS are keyed by value; a column is a fixed
//    positional slot inside its row — column 1 of row 3 is always column 1 of row 3 — so keying it
//    by value would destroy and rebuild the whole column subtree every time the data array is
//    replaced with fresh item objects. <Index> keys by position and hands the item down as an
//    accessor, so only the leaf that reads it re-runs.
//
// The imperative handle needs no delegation layer here, unlike Vue's and Svelte's. `ref` is an
// ordinary prop in the passthrough tail, so it lands on the inner VirtualizedList directly and the
// caller receives that list's own handle — FlatList's handle IS VirtualizedList's (RN says the
// same).

import {
  Index,
  Show,
  createMemo,
  splitProps,
  untrack,
  type Accessor,
} from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import {
  SINGLE_COLUMN,
  chunkIntoRows,
  expandRowViewability,
  firstItemOfRow,
  lastItemOfRow,
  rowKeyExtractor,
  type IRow,
  type ISeparatorProps,
  type IViewabilityConfigCallbackPair,
  type IViewableItemsChangedInfo,
} from '@symbiote-native/components';
import {
  dlog,
  resolveClassName,
  type IStyleProp,
  type IViewStyle,
} from '@symbiote-native/engine';
import {
  VirtualizedList,
  type IVirtualizedListCellInfo,
  type IVirtualizedListHandle,
  type IVirtualizedListProps,
} from '../virtualized-list';

// FlatList's imperative handle is exactly VirtualizedList's: every scrollTo* is forwarded down to
// the list underneath. Same alias React, Vue and Svelte publish.
export type IFlatListHandle = IVirtualizedListHandle;

// Declared as VirtualizedList's surface minus the raw data-access trio, so the two prop types
// cannot drift apart. The accessibility surface, the chrome slots, `ref`, `class`, the scroll
// callbacks and every windowing knob ride in through that Omit for free.
export type IFlatListProps<ItemT> = Omit<
  IVirtualizedListProps<ItemT>,
  'data' | 'getItem' | 'getItemCount'
> & {
  data: readonly ItemT[];
  numColumns?: number;
  // Style for the auto-generated row View when numColumns > 1 (RN's columnWrapperStyle). A bare
  // string resolves through the shared style registry, like `class` — same widening React's and
  // Vue's columnWrapperStyle carry.
  columnWrapperStyle?: IStyleProp<IViewStyle> | string;
};

// What FlatList itself consumes or re-shapes. Everything NOT listed here is passthrough and rides
// down onto the inner list untouched — `ref` among it, which is why no delegate handle is needed.
const OWN_PROPS = [
  'data',
  'numColumns',
  'columnWrapperStyle',
  'renderItem',
  'keyExtractor',
  'ItemSeparatorComponent',
  'onViewableItemsChanged',
  'viewabilityConfigCallbackPairs',
] as const;

const ROW_STYLE: IViewStyle = { flexDirection: 'row' };
// Equal weight per column, so `numColumns` columns split the row evenly (RN's own multi-column
// FlatList). A cell that sized itself would leave ragged columns.
const COLUMN_STYLE: IViewStyle = { flex: 1 };

export function FlatList<ItemT>(props: IFlatListProps<ItemT>): JSX.Element {
  const [, passthrough] = splitProps(props, OWN_PROPS);

  const columnCount = (): number => props.numColumns ?? SINGLE_COLUMN;
  // RN treats anything at or below one column as an ordinary single-column list rather than an
  // error, and so does adapters/react.
  const isMultiColumn = (): boolean => columnCount() > SINGLE_COLUMN;

  const rows = createMemo((): IRow<ItemT>[] => {
    const columns = columnCount();
    // Logged from inside the memo, not from the body: a Solid body runs ONCE, so a line emitted
    // there would report the mount-time shape forever and be actively misleading on a data change.
    dlog(
      `Solid FlatList over ${props.data.length} items, ${columns} column(s)`,
    );
    return columns > SINGLE_COLUMN ? chunkIntoRows(props.data, columns) : [];
  });

  // A bare string is a registered class name and has to be resolved here — the row view's style
  // prop takes objects/arrays, so an unresolved string would silently paint nothing.
  const rowStyle = createMemo((): IStyleProp<IViewStyle> => [
    ROW_STYLE,
    typeof props.columnWrapperStyle === 'string'
      ? resolveClassName(props.columnWrapperStyle)
      : props.columnWrapperStyle,
  ]);

  function renderRow(
    info: Accessor<IVirtualizedListCellInfo<IRow<ItemT>>>,
  ): JSX.Element {
    return (
      <symbiote-view style={rowStyle()}>
        <Index each={info().item.items}>
          {(item, column): JSX.Element => {
            // Called ONCE and untracked, the shape VirtualizedList's own cell build uses: a
            // tracked call would put every signal renderItem reads into this column's insert
            // effect and rebuild the subtree instead of updating its leaf.
            const content = untrack(() =>
              props.renderItem(() => ({
                item: item(),
                index: info().item.startIndex + column,
                // The row IS the virtualized cell, so every column in it shares the row's
                // separators handle — the divider sits between rows, not between columns.
                separators: info().separators,
              })),
            );
            return (
              <symbiote-view style={COLUMN_STYLE}>{content}</symbiote-view>
            );
          }}
        </Index>
      </symbiote-view>
    );
  }

  // The divider between rows shows real items (last of the row above, first of the row below), so
  // the caller's separator, typed on ItemT, never sees the IRow wrapper.
  const rowSeparatorComponent = createMemo(
    (): ((props: ISeparatorProps<IRow<ItemT>>) => JSX.Element) | undefined => {
      const Separator = props.ItemSeparatorComponent;
      if (Separator === undefined) return undefined;
      return (rowProps): JSX.Element => (
        <Separator
          {...rowProps}
          leadingItem={lastItemOfRow(rowProps.leadingItem)}
          trailingItem={firstItemOfRow(rowProps.trailingItem)}
        />
      );
    },
  );

  // Viewability over rows expands back to per-item tokens, so the caller sees item-level
  // visibility rather than row-level (shared expandRowViewability).
  const rowViewability = createMemo(
    ():
      ((info: IViewableItemsChangedInfo<IRow<ItemT>>) => void) | undefined => {
      const onChanged = props.onViewableItemsChanged;
      if (onChanged === undefined) return undefined;
      return (rowInfo): void =>
        onChanged(expandRowViewability(rowInfo, props.keyExtractor));
    },
  );
  const rowViewabilityPairs = createMemo(
    (): IViewabilityConfigCallbackPair<IRow<ItemT>>[] | undefined =>
      props.viewabilityConfigCallbackPairs?.map(pair => ({
        viewabilityConfig: pair.viewabilityConfig,
        onViewableItemsChanged: (
          rowInfo: IViewableItemsChangedInfo<IRow<ItemT>>,
        ): void => {
          pair.onViewableItemsChanged(
            expandRowViewability(rowInfo, props.keyExtractor),
          );
        },
      })),
  );

  // The two paths instantiate VirtualizedList over DIFFERENT item types — ItemT vs IRow<ItemT> —
  // so they are two elements, not one with switching props: a single instantiation would have to
  // union the two and narrow ItemT | IRow<ItemT> back apart at runtime, which nothing can do
  // soundly for an arbitrary ItemT. <Show> memoizes on the flip alone, so a numColumns change
  // rebuilds (RN documents changing it live as unsupported — "change the key prop" — which is the
  // same fresh start) while every other prop change re-props the live list.
  return (
    <Show
      when={isMultiColumn()}
      fallback={
        <VirtualizedList<ItemT>
          {...passthrough}
          data={props.data}
          getItem={(_source: unknown, index: number): ItemT =>
            props.data[index]
          }
          getItemCount={(): number => props.data.length}
          renderItem={props.renderItem}
          keyExtractor={props.keyExtractor}
          ItemSeparatorComponent={props.ItemSeparatorComponent}
          onViewableItemsChanged={props.onViewableItemsChanged}
          viewabilityConfigCallbackPairs={props.viewabilityConfigCallbackPairs}
        />
      }
    >
      <VirtualizedList<IRow<ItemT>>
        {...passthrough}
        data={rows()}
        getItem={(_source: unknown, index: number): IRow<ItemT> =>
          rows()[index]
        }
        getItemCount={(): number => rows().length}
        renderItem={renderRow}
        keyExtractor={rowKeyExtractor}
        ItemSeparatorComponent={rowSeparatorComponent()}
        onViewableItemsChanged={rowViewability()}
        viewabilityConfigCallbackPairs={rowViewabilityPairs()}
      />
    </Show>
  );
}
