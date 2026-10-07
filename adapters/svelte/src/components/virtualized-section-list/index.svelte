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
    cellGapsFor,
    createSeparatorBoard,
    flattenSections,
    resolveStickySectionHeaders,
    resolveScrollLocation,
    SEPARATOR_GAP_KIND,
    sectionEntryKey,
    type ISectionEntry,
    type ISeparatorGap,
  } from '@symbiote-native/components';
  import { Platform, dlog, type ISymbioteNode } from '@symbiote-native/engine';
  import VirtualizedList from '../virtualized-list/index.svelte';
  import SectionItemCell from './section-item-cell.svelte';
  import { pickAccessibilityProps } from '../virtualized-list/virtualized-list-props';
  import type {
    IVirtualizedListHandle,
    IScrollViewHandle,
  } from '../virtualized-list/virtualized-list-props';
  import type {
    IVirtualizedSectionListProps as IProps,
    ISection,
  } from './virtualized-section-list-props';
  import { pickAttachmentProps } from '../../runes/attachments';

  let props: IProps<ItemT> = $props();

  let inner = $state.raw<IVirtualizedListHandle | null>(null);

  // Forwarded as a component-prop spread onto the inner VirtualizedList (a compiled Svelte
  // component, not a symbiote-* host tag — see flat-list/index.svelte's identical comment).
  const accessibilityProps = $derived(pickAccessibilityProps(props));

  type IEntry = ISectionEntry<ItemT, ISection<ItemT>>;

  const board = createSeparatorBoard<Record<string, unknown>>();
  const flattened = $derived.by(() =>
    flattenSections<ItemT, ISection<ItemT>>(props.sections),
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
  // Diagnostic: logs every INPUT this $derived reads, not just VirtualizedList's own result —
  // `stickyHeaderIndices` can come back undefined on Android with the bare
  // `stickySectionHeadersEnabled` shorthand, and only the inputs show what differs.
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

  function getEntry(_source: unknown, index: number): IEntry {
    return entries[index];
  }
  function getEntryCount(): number {
    return entries.length;
  }
  function entryKeyExtractor(entry: IEntry): string {
    return sectionEntryKey(entry, props.keyExtractor);
  }

  // Hand the callback `sections`, not the entries: RN's inner VirtualizedList gets
  // `data={this.props.sections}` (VirtualizedSectionList.js:216) while ours streams the FLATTENED
  // entries, so the same user code would otherwise see a different argument here than on RN
  const entryItemLayout = $derived.by(() => {
    const getItemLayout = props.getItemLayout;
    if (getItemLayout === undefined) return undefined;
    return (
      _entries: unknown,
      index: number,
    ): { length: number; offset: number; index: number } =>
      getItemLayout(props.sections, index);
  });

  // The separator snippet for a gap: the section one, or the item one where a section's own beats
  // the list's
  function separatorFor(gap: ISeparatorGap<ItemT, ISection<ItemT>>) {
    if (gap.props === undefined) return undefined;
    if (gap.kind === SEPARATOR_GAP_KIND.section) return props.sectionSeparator;
    return gap.props.section.separator ?? props.separator;
  }

  function prevKeyOf(index: number): string | undefined {
    const previous = entries[index - 1];
    return previous === undefined ? undefined : entryKeyExtractor(previous);
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
    const target = resolveScrollLocation(
      headerIndices,
      stickyHeaderIndices,
      params,
    );
    if (target === undefined) {
      dlog(
        `VirtualizedSectionList scrollToLocation: section ${params.sectionIndex} out of range`,
      );
      return;
    }
    dlog(
      `VirtualizedSectionList scrollToLocation section=${params.sectionIndex} item=${params.itemIndex} -> flat ${target.index}`,
    );
    inner?.scrollToIndex(target);
  }
  export function flashScrollIndicators(): void {
    inner?.flashScrollIndicators();
  }
  export function getNativeScrollRef(): ISymbioteNode | null {
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
  export function getScrollRef(): ISymbioteNode | null {
    return inner?.getScrollRef() ?? null;
  }
  export function recordInteraction(): void {
    inner?.recordInteraction();
  }

  // `{@attach}` arrives as a symbol-keyed prop, which naming individual props below drops.
  // Re-spread just those onto the inner list, which owns the real host node.
  const attachments = $derived(pickAttachmentProps(props));
</script>

{#snippet entryItem({ item: entry, index }: { item: IEntry; index: number })}
  {#if entry.kind === 'header'}
    {@render props.sectionHeader?.({ section: entry.section })}
  {:else if entry.kind === 'footer'}
    {@render props.sectionFooter?.({ section: entry.section })}
  {:else}
    {@const gaps = cellGapsFor(entries, index)}
    <SectionItemCell
      {board}
      cellKey={entryKeyExtractor(entry)}
      prevCellKey={prevKeyOf(index)}
      item={entry.item}
      index={entry.itemIndex}
      section={entry.section}
      renderItem={entry.section.item ?? props.item}
      leadingGap={gaps.leading}
      trailingGap={gaps.trailing}
      leadingSeparator={separatorFor(gaps.leading)}
      trailingSeparator={separatorFor(gaps.trailing)}
      isInverted={props.inverted === true}
    />
  {/if}
{/snippet}

<VirtualizedList
  bind:this={inner}
  {...accessibilityProps}
  {...attachments}
  data={entries}
  getItem={getEntry}
  getItemCount={getEntryCount}
  item={entryItem}
  cellRenderer={props.cellRenderer}
  header={props.header}
  footer={props.footer}
  empty={props.empty}
  keyExtractor={entryKeyExtractor}
  getItemLayout={entryItemLayout}
  {stickyHeaderIndices}
  inverted={props.inverted}
  horizontal={props.horizontal}
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
  disableVirtualization={props.disableVirtualization}
  maintainVisibleContentPosition={props.maintainVisibleContentPosition}
  onScroll={props.onScroll}
  onContentSizeChange={props.onContentSizeChange}
  onScrollBeginDrag={props.onScrollBeginDrag}
  onScrollEndDrag={props.onScrollEndDrag}
  onMomentumScrollBegin={props.onMomentumScrollBegin}
  onMomentumScrollEnd={props.onMomentumScrollEnd}
  scrollEventThrottle={props.scrollEventThrottle}
  keyboardShouldPersistTaps={props.keyboardShouldPersistTaps}
  keyboardDismissMode={props.keyboardDismissMode}
  removeClippedSubviews={props.removeClippedSubviews}
  nestedScrollEnabled={props.nestedScrollEnabled}
  stickyHeaderHiddenOnScroll={props.stickyHeaderHiddenOnScroll}
  innerViewRef={props.innerViewRef}
  style={props.style}
  contentContainerStyle={props.contentContainerStyle}
  listHeaderComponentStyle={props.listHeaderComponentStyle}
  listFooterComponentStyle={props.listFooterComponentStyle}
  class={props.class}
/>
