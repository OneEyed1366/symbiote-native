<script lang="ts" module>
  // The public list-of-sections component, a thin wrapper over `VirtualizedSectionList` as in RN
  // A `bind:this` here resolves to this component's own exports, so the handle is re-declared and
  // delegated, as re-exporting the child's exports directly would not reach it
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
  import type { IScrollViewHandle } from '@symbiote-native/components';
  import type { IVirtualizedSectionListHandle } from '../virtualized-section-list/virtualized-section-list-props';
  import type { ISectionListProps as IProps } from './section-list-props';
  import { pickAttachmentProps } from '../../runes/attachments';
  import type { ISymbioteNode } from '@symbiote-native/engine';

  let props: IProps<ItemT> = $props();

  let inner = $state.raw<IVirtualizedSectionListHandle | null>(null);

  // Spread onto `VirtualizedSectionList`, a compiled component and not a host tag, as in flat-list
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
  export function setNativeProps(props: Record<string, unknown>): void {
    inner?.setNativeProps(props);
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
  cellRenderer={props.cellRenderer}
  header={props.header}
  footer={props.footer}
  empty={props.empty}
  keyExtractor={props.keyExtractor}
  getItemLayout={props.getItemLayout}
  stickySectionHeadersEnabled={props.stickySectionHeadersEnabled}
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
