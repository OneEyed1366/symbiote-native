<script lang="ts" module>
  // VirtualizedSectionList: sections flattened into one virtualized stream over VirtualizedList.
  // Each section contributes a header row, its item rows, then a footer row (RN counts 2 per
  // section); the flattened tagged sequence feeds VirtualizedList as one list, so headers, items,
  // and footers are all windowed by the same machinery. The flattening, entry keying,
  // separator-item unwrap, and scrollToLocation mapping are shared verbatim from
  // @symbiote-native/components; this file wires only Svelte's lifecycle (typed prop inputs +
  // handle delegation + the per-entry render dispatch) — the Svelte twin of the React/Vue
  // VirtualizedSectionList.
  import type {
    IVirtualizedSectionListProps,
    IVirtualizedSectionListHandle,
    ISection,
  } from './virtualized-section-list-props';

  export type {
    IVirtualizedSectionListProps,
    IVirtualizedSectionListHandle,
    ISection,
  };
</script>

<script lang="ts" generics="ItemT">
  import {
    flattenSections,
    resolveStickySectionHeaders,
    scrollLocationToFlatIndex,
    sectionEntryKey,
    unwrapEntryItem,
    type ISectionEntry,
    type ISeparatorProps,
    type ISeparators,
  } from '@symbiote-native/components';
  import { Platform, dlog, type ISymbioteNode } from '@symbiote-native/engine';
  import VirtualizedList from '../virtualized-list/index.svelte';
  import { pickAccessibilityProps } from '../virtualized-list/virtualized-list-props';
  import type {
    IVirtualizedListHandle,
    IScrollViewHandle,
  } from '../virtualized-list/virtualized-list-props';
  import type { IVirtualizedSectionListProps as IProps } from './virtualized-section-list-props';
  import { pickAttachmentProps } from '../../runes/attachments';

  let props: IProps<ItemT> = $props();

  let inner = $state.raw<IVirtualizedListHandle | null>(null);

  // Forwarded as a component-prop spread onto the inner VirtualizedList (a compiled Svelte
  // component, not a symbiote-* host tag — see flat-list/index.svelte's identical comment).
  const accessibilityProps = $derived(pickAccessibilityProps(props));

  const flattened = $derived.by(() =>
    flattenSections(props.sections, props.sectionSeparator !== undefined),
  );
  const entries = $derived(flattened.entries);
  const headerIndices = $derived(flattened.headerIndices);

  // RN sticks section headers by default only on iOS; Android does not unless asked.
  const stickyHeaderIndices = $derived(
    resolveStickySectionHeaders(
      props.stickySectionHeadersEnabled,
      headerIndices,
      Platform.OS,
    ),
  );
  // DIAGNOSTIC (2026-08-13, tracking why stickyHeaderIndices comes back undefined on Android
  // despite the demo passing the bare `stickySectionHeadersEnabled` shorthand): the previous
  // logging only showed the RESULT (VirtualizedList's own dlog), never the INPUTS this $derived
  // actually read — isolated verification proved bare-shorthand forwarding through this exact
  // two-hop generic-component chain works correctly in a standalone repro, so this must show
  // what differs in the real component tree.
  $effect(() => {
    dlog(
      `VirtualizedSectionList sticky-inputs enabled=${String(props.stickySectionHeadersEnabled)} ` +
        `platformOS=${Platform.OS} headerIndices=${JSON.stringify(headerIndices)} ` +
        `resolved=${JSON.stringify(stickyHeaderIndices)}`,
    );
  });

  $effect(() => {
    dlog(
      `VirtualizedSectionList: ${props.sections.length} sections flattened to ${entries.length} entries`,
    );
  });

  function getEntry(_source: unknown, index: number): ISectionEntry<ItemT> {
    return entries[index];
  }
  function getEntryCount(): number {
    return entries.length;
  }
  function entryKeyExtractor(
    entry: ISectionEntry<ItemT>,
    index: number,
  ): string {
    return sectionEntryKey(entry, index, props.keyExtractor);
  }

  // Hand the callback `sections`, not the entries: RN's inner VirtualizedList gets
  // `data={this.props.sections}` (VirtualizedSectionList.js:216) while ours streams the FLATTENED
  // entries, so the same user code would otherwise see a different argument here than on RN.
  //
  // UPSTREAM-DIVERGENCE(react-native): the flat INDEX matches RN's (two rows per section, header
  // and footer) only while the `sectionSeparator` snippet is unset. With it, flattenSections emits
  // an extra 'section-separator' row per boundary that RN renders inside the neighbouring cell, so
  // indices shift by one per boundary from the second section on. Deliberate - that row is how this
  // adapter paints the separator; a caller combining the two must account for it.
  const entryItemLayout = $derived.by(() => {
    const getItemLayout = props.getItemLayout;
    if (getItemLayout === undefined) return undefined;
    return (
      _entries: unknown,
      index: number,
    ): { length: number; offset: number; index: number } =>
      getItemLayout(props.sections, index);
  });

  function entrySeparatorProps(
    entryProps: ISeparatorProps<ISectionEntry<ItemT>>,
  ): ISeparatorProps<ItemT> {
    return {
      ...entryProps,
      leadingItem: unwrapEntryItem(entryProps.leadingItem),
      trailingItem: unwrapEntryItem(entryProps.trailingItem),
    };
  }

  // ---- imperative handle: scrollToLocation resolves (sectionIndex, itemIndex) to the flattened
  // entry index and forwards to the inner VirtualizedList; everything else routes straight
  // through, the Svelte twin of the shared IScrollRoutingHandle tail. ----
  export function scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void {
    const flatIndex = scrollLocationToFlatIndex(
      headerIndices,
      params.sectionIndex,
      params.itemIndex,
    );
    if (flatIndex === undefined) {
      dlog(
        `VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
      );
      return;
    }
    dlog(
      `VirtualizedSectionList scrollToLocation section=${params.sectionIndex} item=${params.itemIndex} -> flat ${flatIndex}`,
    );
    inner?.scrollToIndex({
      index: flatIndex,
      viewOffset: params.viewOffset,
      viewPosition: params.viewPosition,
      animated: params.animated,
    });
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

{#snippet entryItem({
  item: entry,
  index,
  separators,
}: {
  item: ISectionEntry<ItemT>;
  index: number;
  separators: ISeparators;
})}
  {#if entry.kind === 'header'}
    {@render props.sectionHeader?.({ section: entry.section })}
  {:else if entry.kind === 'footer'}
    {@render props.sectionFooter?.({ section: entry.section })}
  {:else if entry.kind === 'section-separator'}
    {@render props.sectionSeparator?.()}
  {:else}
    {@render props.item({
      item: entry.item,
      index: entry.itemIndex,
      section: entry.section,
      separators,
    })}
  {/if}
{/snippet}

{#snippet entrySeparator(entryProps: ISeparatorProps<ISectionEntry<ItemT>>)}
  {@render props.separator?.(entrySeparatorProps(entryProps))}
{/snippet}

<VirtualizedList
  bind:this={inner}
  {...accessibilityProps}
  {...attachments}
  data={entries}
  getItem={getEntry}
  getItemCount={getEntryCount}
  item={entryItem}
  separator={props.separator ? entrySeparator : undefined}
  header={props.header}
  footer={props.footer}
  empty={props.empty}
  keyExtractor={entryKeyExtractor}
  getItemLayout={entryItemLayout}
  {stickyHeaderIndices}
  inverted={props.inverted}
  extraData={props.extraData}
  onEndReached={props.onEndReached}
  onEndReachedThreshold={props.onEndReachedThreshold}
  onStartReached={props.onStartReached}
  onStartReachedThreshold={props.onStartReachedThreshold}
  onRefresh={props.onRefresh}
  refreshing={props.refreshing}
  progressViewOffset={props.progressViewOffset}
  initialNumToRender={props.initialNumToRender}
  initialScrollIndex={props.initialScrollIndex}
  maxToRenderPerBatch={props.maxToRenderPerBatch}
  updateCellsBatchingPeriod={props.updateCellsBatchingPeriod}
  windowSize={props.windowSize}
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
