<script lang="ts" generics="ItemT">
  import { FlatList } from '@symbiote-native/svelte';
  import type { IFlatListHandle } from '@symbiote-native/svelte';
  import LayoutAnimationConfig from './layout-animation-config.svelte';
  import type {
    IAnimatedFlatListProps,
    IListCell,
  } from './animated-flat-list-props';

  // One scroll event per frame, so an animation that follows the scroll has a value every frame
  const EVERY_FRAME = 1;

  let {
    itemLayoutAnimation,
    skipEnteringExitingAnimations,
    cellRendererComponentStyle,
    ...rest
  }: IAnimatedFlatListProps<ItemT> = $props();

  let inner = $state.raw<IFlatListHandle | null>(null);

  function rowStyleOf(cell: IListCell) {
    return typeof cellRendererComponentStyle === 'function'
      ? cellRendererComponentStyle(cell)
      : cellRendererComponentStyle;
  }

  // The list is its own handle for the author, so what it exposes goes through to the inner one
  export function scrollToOffset(params: { offset: number; animated?: boolean }) {
    inner?.scrollToOffset(params);
  }
  export function scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }) {
    inner?.scrollToIndex(params);
  }
  export function scrollToItem(params: {
    item: unknown;
    animated?: boolean;
    viewPosition?: number;
  }) {
    inner?.scrollToItem(params);
  }
  export function scrollToEnd(params?: { animated?: boolean }) {
    inner?.scrollToEnd(params);
  }
  export function flashScrollIndicators() {
    inner?.flashScrollIndicators();
  }
  export function getNativeScrollRef() {
    return inner?.getNativeScrollRef() ?? null;
  }
  export function getScrollableNode() {
    return inner?.getScrollableNode() ?? null;
  }
  export function getScrollResponder() {
    return inner?.getScrollResponder() ?? null;
  }
  export function getScrollNode() {
    return inner?.getScrollNode() ?? null;
  }
  export function getScrollRef() {
    return inner?.getScrollRef() ?? null;
  }
  export function recordInteraction() {
    inner?.recordInteraction();
  }
  export function setNativeProps(props: Record<string, unknown>) {
    inner?.setNativeProps(props);
  }
</script>

{#snippet row(cell: IListCell)}
  <view
    p={{
      layout: itemLayoutAnimation,
      onLayout: cell.onLayout,
      onFocus: cell.onFocus,
      style: [cell.style, rowStyleOf(cell)],
    }}
  >
    {@render cell.children()}
  </view>
{/snippet}

{#snippet list()}
  <FlatList
    bind:this={inner}
    scrollEventThrottle={EVERY_FRAME}
    {...rest}
    cellRenderer={row}
  />
{/snippet}

{#if skipEnteringExitingAnimations === undefined}
  {@render list()}
{:else}
  <LayoutAnimationConfig skipEntering skipExiting>
    {@render list()}
  </LayoutAnimationConfig>
{/if}
