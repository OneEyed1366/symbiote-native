<script lang="ts" module>
  // SectionList: the public list-of-sections component. A thin wrapper over
  // VirtualizedSectionList, mirroring RN's layering (SectionList -> VirtualizedSectionList ->
  // VirtualizedList). All section-flattening / windowing / imperative-scroll logic lives below;
  // this layer re-exposes the same surface under the SectionList name and delegates the handle
  // (a Svelte `bind:this` on THIS component resolves to whatever THIS component exports, so the
  // wrapper must re-declare + delegate rather than re-exporting the child's exports directly) —
  // the Svelte twin of the React/Vue SectionList.
  import type {
    ISectionListProps,
    ISectionListHandle,
    ISection,
  } from './section-list-props';

  export type { ISectionListProps, ISectionListHandle, ISection };
</script>

<script lang="ts" generics="ItemT">
  import VirtualizedSectionList from '../virtualized-section-list/index.svelte';
  import { pickAccessibilityProps } from '../virtualized-list/virtualized-list-props';
  import type {
    IVirtualizedSectionListHandle,
    IScrollViewHandle,
  } from '../virtualized-list/virtualized-list-props';
  import type { ISectionListProps as IProps } from './section-list-props';
  import { pickAttachmentProps } from '../../runes/attachments';
  import type { ISymbioteNode } from '@symbiote-native/engine';

  let props: IProps<ItemT> = $props();

  let inner = $state.raw<IVirtualizedSectionListHandle | null>(null);

  // Forwarded as a component-prop spread onto VirtualizedSectionList (a compiled Svelte
  // component, not a symbiote-* host tag — see flat-list/index.svelte's identical comment).
  const accessibilityProps = $derived(pickAccessibilityProps(props));

  export function scrollToLocation(params: {
    sectionIndex: number;
    itemIndex: number;
    viewOffset?: number;
    viewPosition?: number;
    animated?: boolean;
  }): void {
    inner?.scrollToLocation(params);
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

<VirtualizedSectionList
  bind:this={inner}
  {...accessibilityProps}
  {...attachments}
  sections={props.sections}
  item={props.item}
  sectionHeader={props.sectionHeader}
  sectionFooter={props.sectionFooter}
  sectionSeparator={props.sectionSeparator}
  separator={props.separator}
  header={props.header}
  footer={props.footer}
  empty={props.empty}
  keyExtractor={props.keyExtractor}
  stickySectionHeadersEnabled={props.stickySectionHeadersEnabled}
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
