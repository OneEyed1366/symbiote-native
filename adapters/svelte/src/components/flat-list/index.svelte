<script lang="ts" module>
  // FlatList: the convenience surface over VirtualizedList. Takes a plain `data` array and
  // derives getItem/getItemCount; numColumns packs items into rows (a horizontal sub-View), so
  // the virtualized stream is rows, not items (RN's FlatList). All windowing / viewability /
  // batching / imperative scrolling are inherited from VirtualizedList; the data-shaping and the
  // row/viewability/separator transforms are shared verbatim from @symbiote-native/components,
  // exactly like the React/Vue FlatList over their own VirtualizedList.
  import type { IFlatListProps, IFlatListHandle } from './flat-list-props';

  export type { IFlatListProps, IFlatListHandle };
</script>

<script lang="ts" generics="ItemT">
  import {
    SINGLE_COLUMN,
    chunkIntoRows,
    expandRowViewability,
    firstItemOfRow,
    lastItemOfRow,
    rowKeyExtractor,
    type IRow,
    type ISeparatorProps,
    type ISeparators,
    type IViewableItemsChangedInfo,
  } from '@symbiote-native/components';
  import {
    resolveClassName,
    type ISymbioteNode,
  } from '@symbiote-native/engine';
  import VirtualizedList from '../virtualized-list/index.svelte';
  import { pickAccessibilityProps } from '../virtualized-list/virtualized-list-props';
  import type {
    IVirtualizedListHandle,
    IScrollViewHandle,
  } from '../virtualized-list/virtualized-list-props';
  import type { IFlatListProps as IProps } from './flat-list-props';
  import { pickAttachmentProps } from '../../runes/attachments';

  let props: IProps<ItemT> = $props();

  // $state.raw: the inner VirtualizedList component instance (its exports), held by identity —
  // same concern as every other handle in this adapter (Switch's hostShim, VirtualizedList's own
  // scrollHandle over its ShimElement).
  let inner = $state.raw<IVirtualizedListHandle | null>(null);

  const numColumns = $derived(
    typeof props.numColumns === 'number' ? props.numColumns : SINGLE_COLUMN,
  );
  const rows = $derived.by((): IRow<ItemT>[] =>
    numColumns > SINGLE_COLUMN ? chunkIntoRows(props.data, numColumns) : [],
  );

  function getSingleItem(_source: unknown, index: number): ItemT {
    return props.data[index];
  }
  function getSingleCount(): number {
    return props.data.length;
  }
  function getRow(_source: unknown, index: number): IRow<ItemT> {
    return rows[index];
  }
  function getRowCount(): number {
    return rows.length;
  }

  function isStyleLike(value: unknown): boolean {
    return (
      Array.isArray(value) || (typeof value === 'object' && value !== null)
    );
  }

  const rowStyle = $derived.by(() => [
    { flexDirection: 'row' as const },
    typeof props.columnWrapperStyle === 'string'
      ? resolveClassName(props.columnWrapperStyle)
      : isStyleLike(props.columnWrapperStyle)
        ? props.columnWrapperStyle
        : undefined,
  ]);

  // The divider between rows shows real items (last of the row above, first of the row below), so
  // the user's `separator` snippet, typed on ItemT, sees items rather than the IRow wrapper.
  function rowSeparatorProps(
    entryProps: ISeparatorProps<IRow<ItemT>>,
  ): ISeparatorProps<ItemT> {
    return {
      ...entryProps,
      leadingItem: lastItemOfRow(entryProps.leadingItem),
      trailingItem: firstItemOfRow(entryProps.trailingItem),
    };
  }

  const rowOnViewableItemsChanged = $derived.by(() => {
    const onChanged = props.onViewableItemsChanged;
    if (onChanged === undefined) return undefined;
    return (rowInfo: IViewableItemsChangedInfo<IRow<ItemT>>): void =>
      onChanged(expandRowViewability(rowInfo, props.keyExtractor));
  });
  const rowViewabilityPairs = $derived(
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

  // Forwarded onto the inner VirtualizedList as a component-prop spread (not a raw attribute
  // spread on a symbiote-* host tag — that stays banned, svelte-adapter-dom-shim skill §3g(c) —
  // this lands on another compiled Svelte COMPONENT, an ordinary prop merge). Picked field-by-
  // field by pickAccessibilityProps, same helper VirtualizedList's own host bag uses.
  const accessibilityProps = $derived(pickAccessibilityProps(props));

  // ---- imperative handle: delegate straight through to the inner VirtualizedList instance. ----
  export function scrollToOffset(params: {
    offset: number;
    animated?: boolean;
  }): void {
    inner?.scrollToOffset(params);
  }
  export function scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void {
    inner?.scrollToIndex(params);
  }
  export function scrollToItem(params: {
    item: unknown;
    animated?: boolean;
    viewPosition?: number;
  }): void {
    inner?.scrollToItem(params);
  }
  export function scrollToEnd(params?: { animated?: boolean }): void {
    inner?.scrollToEnd(params);
  }
  export function flashScrollIndicators(): void {
    inner?.flashScrollIndicators();
  }
  export function getNativeScrollRef(): IScrollViewHandle | null {
    return inner?.getNativeScrollRef() ?? null;
  }
  export function getScrollableNode(): IScrollViewHandle | null {
    return inner?.getScrollableNode() ?? null;
  }
  export function getScrollResponder(): IScrollViewHandle | null {
    return inner?.getScrollResponder() ?? null;
  }
  export function getScrollNode(): ISymbioteNode | null {
    return inner?.getScrollNode() ?? null;
  }
  export function recordInteraction(): void {
    inner?.recordInteraction();
  }

  // `{@attach}` arrives as a symbol-keyed prop, which naming individual props below drops.
  // Re-spread just those onto the inner list, which owns the real host node.
  const attachments = $derived(pickAttachmentProps(props));
</script>

{#snippet rowItem({
  item: row,
  index,
  separators,
}: {
  item: IRow<ItemT>;
  index: number;
  separators: ISeparators;
})}
  <symbiote-view p={{ style: rowStyle }}>
    {#each row.items as rowItem, column (props.keyExtractor ? props.keyExtractor(rowItem, row.startIndex + column) : String(row.startIndex + column))}
      <symbiote-view p={{ style: { flex: 1 } }}>
        {@render props.item({
          item: rowItem,
          index: row.startIndex + column,
          separators,
        })}
      </symbiote-view>
    {/each}
  </symbiote-view>
{/snippet}

{#snippet rowSeparator(entryProps: ISeparatorProps<IRow<ItemT>>)}
  {@render props.separator?.(rowSeparatorProps(entryProps))}
{/snippet}

{#if numColumns <= SINGLE_COLUMN}
  <VirtualizedList
    bind:this={inner}
    {...accessibilityProps}
    {...attachments}
    data={props.data}
    getItem={getSingleItem}
    getItemCount={getSingleCount}
    item={props.item}
    separator={props.separator}
    header={props.header}
    footer={props.footer}
    empty={props.empty}
    keyExtractor={props.keyExtractor}
    getItemLayout={props.getItemLayout}
    horizontal={props.horizontal}
    inverted={props.inverted}
    extraData={props.extraData}
    onEndReached={props.onEndReached}
    onEndReachedThreshold={props.onEndReachedThreshold}
    onStartReached={props.onStartReached}
    onStartReachedThreshold={props.onStartReachedThreshold}
    onRefresh={props.onRefresh}
    refreshing={props.refreshing}
    progressViewOffset={props.progressViewOffset}
    onViewableItemsChanged={props.onViewableItemsChanged}
    viewabilityConfig={props.viewabilityConfig}
    viewabilityConfigCallbackPairs={props.viewabilityConfigCallbackPairs}
    onScrollToIndexFailed={props.onScrollToIndexFailed}
    initialNumToRender={props.initialNumToRender}
    initialScrollIndex={props.initialScrollIndex}
    maxToRenderPerBatch={props.maxToRenderPerBatch}
    updateCellsBatchingPeriod={props.updateCellsBatchingPeriod}
    windowSize={props.windowSize}
    stickyHeaderIndices={props.stickyHeaderIndices}
    maintainVisibleContentPosition={props.maintainVisibleContentPosition}
    onScroll={props.onScroll}
    onScrollBeginDrag={props.onScrollBeginDrag}
    onScrollEndDrag={props.onScrollEndDrag}
    onMomentumScrollBegin={props.onMomentumScrollBegin}
    onMomentumScrollEnd={props.onMomentumScrollEnd}
    scrollEventThrottle={props.scrollEventThrottle}
    keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
    keyboardDismissMode={props.keyboardDismissMode}
    style={props.style}
    contentContainerStyle={props.contentContainerStyle}
    class={props.class}
  />
{:else}
  <VirtualizedList
    bind:this={inner}
    {...accessibilityProps}
    {...attachments}
    data={rows}
    getItem={getRow}
    getItemCount={getRowCount}
    item={rowItem}
    separator={props.separator ? rowSeparator : undefined}
    header={props.header}
    footer={props.footer}
    empty={props.empty}
    keyExtractor={rowKeyExtractor}
    getItemLayout={props.getItemLayout}
    horizontal={props.horizontal}
    inverted={props.inverted}
    extraData={props.extraData}
    onEndReached={props.onEndReached}
    onEndReachedThreshold={props.onEndReachedThreshold}
    onStartReached={props.onStartReached}
    onStartReachedThreshold={props.onStartReachedThreshold}
    onRefresh={props.onRefresh}
    refreshing={props.refreshing}
    progressViewOffset={props.progressViewOffset}
    onViewableItemsChanged={rowOnViewableItemsChanged}
    viewabilityConfig={props.viewabilityConfig}
    viewabilityConfigCallbackPairs={rowViewabilityPairs}
    onScrollToIndexFailed={props.onScrollToIndexFailed}
    initialNumToRender={props.initialNumToRender}
    initialScrollIndex={props.initialScrollIndex}
    maxToRenderPerBatch={props.maxToRenderPerBatch}
    updateCellsBatchingPeriod={props.updateCellsBatchingPeriod}
    windowSize={props.windowSize}
    stickyHeaderIndices={props.stickyHeaderIndices}
    maintainVisibleContentPosition={props.maintainVisibleContentPosition}
    onScroll={props.onScroll}
    onScrollBeginDrag={props.onScrollBeginDrag}
    onScrollEndDrag={props.onScrollEndDrag}
    onMomentumScrollBegin={props.onMomentumScrollBegin}
    onMomentumScrollEnd={props.onMomentumScrollEnd}
    scrollEventThrottle={props.scrollEventThrottle}
    keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
    keyboardDismissMode={props.keyboardDismissMode}
    style={props.style}
    contentContainerStyle={props.contentContainerStyle}
    class={props.class}
  />
{/if}
