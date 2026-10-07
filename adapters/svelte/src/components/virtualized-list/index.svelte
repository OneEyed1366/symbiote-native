<script lang="ts" generics="ItemT">
  // Windowed list over the shared `reduceList` machine, this file owns only Svelte's lifecycle
  // The scroll tag is authored directly so the cell walk can mark sticky cells itself
  // No content node: `registerScrollViewBehavior()` builds it and takes `contentContainerStyle`
  import {
    EMPTY_OFFSET,
    FIRST_INDEX,
    LIST_ACTION_KIND,
    LIST_SEGMENT_KIND,
    buildListHandle,
    buildListReducerInputs,
    buildListScrollProps,
    buildScrollViewHandle,
    buildSeparatorHandles,
    buildViewabilityPairs,
    buildSeparatorProps,
    clearTimers,
    cellStyleOf,
    createInitialListState,
    createListHandlers,
    createListNesting,
    isSeparatorGapInRange,
    listEffectSignature,
    listHasMore,
    listStyleOf,
    planFromMetrics,
    reduceList,
    resolveItemKey,
    runListEffects,
    scrollTargetOf,
    spacerStyleOf,
    type IEffectHost,
    type IListAction,
    type IListHandlers,
    type IListNesting,
    type IListState,
    type IScrollViewHandle,
    type ISeparatorProps,
    type ISeparators,
    type ITimerSlot,
  } from '@symbiote-native/components';
  import { dlog, type ISymbioteNode } from '@symbiote-native/engine';
  import type { ShimElement } from '../../dom-shim';
  import {
    pickAccessibilityProps,
    type IVirtualizedListHandle,
    type IVirtualizedListProps as IProps,
  } from './virtualized-list-props';
  import {
    itemComponentOf,
    refreshControlPropsOf,
    resolveListProps,
  } from './list-props';
  import {
    getVirtualizedListScope,
    setVirtualizedListScope,
  } from './nested-scope';
  import { createAttachmentsSync } from '../../runes/attachments';

  let props: IProps<ItemT> = $props();

  // Raw state keeps the shim element by identity, the engine's WeakMap mirror keys on it
  let hostShim = $state.raw<ShimElement | null>(null);

  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, props);
  });

  // The offset commanded before the engine node is live, a fresh object re-applies a repeat
  let commandedOffset = $state.raw<{ x: number; y: number } | undefined>(
    undefined,
  );
  // `listState` is a plain object, so a change bumps `version` to re-run `metrics`
  let version = $state(0);
  let separatorVersion = $state(0);

  const scrollHandle: IScrollViewHandle = buildScrollViewHandle(
    () => hostShim?.engineNode ?? null,
  );

  const listState: IListState<ItemT> = createInitialListState<ItemT>();
  // Plain Map, `separatorVersion` is the invalidation signal a read tracks
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const separatorOverrides = new Map<number, Partial<ISeparatorProps<ItemT>>>();
  const viewableTimer: ITimerSlot = { current: null };
  const batchTimer: ITimerSlot = { current: null };

  const narrowed = $derived.by(() => {
    // Reading `extraData` makes a change re-run this derived, RN's contract
    void props.extraData;
    return resolveListProps(props);
  });
  const viewabilityPairs = $derived(
    buildViewabilityPairs(
      narrowed.onViewableItemsChanged,
      narrowed.viewabilityConfig,
      narrowed.viewabilityConfigCallbackPairs,
    ),
  );

  function listInputs() {
    return buildListReducerInputs(
      {
        ...narrowed,
        findFirstChildWithMore: (first, last) =>
          nesting.findFirstChildWithMore(first, last),
      },
      viewabilityPairs,
    );
  }

  function keyFor(index: number): string {
    return resolveItemKey(
      narrowed.getItem(narrowed.data, index),
      index,
      narrowed.keyExtractor,
    );
  }

  function scrollToPixel(offset: number, animated: boolean): void {
    const target = scrollTargetOf(offset, narrowed.horizontal);
    if (hostShim?.engineNode === undefined) {
      dlog(`VirtualizedList scrollTo offset=${offset} pending-ref`);
      commandedOffset = target;
      return;
    }
    commandedOffset = undefined;
    dlog(`VirtualizedList scrollTo offset=${offset} animated=${animated}`);
    scrollHandle.scrollTo({ x: target.x, y: target.y, animated });
  }

  const effectHost: IEffectHost<ItemT> = {
    callbacks: () => ({
      onEndReached: narrowed.onEndReached,
      onStartReached: narrowed.onStartReached,
      onScrollToIndexFailed: narrowed.onScrollToIndexFailed,
      viewabilityPairs,
    }),
    scrollToPixel,
    dispatch: () => dispatch,
    viewableTimer,
    batchTimer,
  };

  function dispatch(action: IListAction<ItemT>): void {
    const inputs = listInputs();
    const result = reduceList(listState, action, inputs);
    runListEffects(result.effects, effectHost);
    if (result.changed) version += 1;
  }

  // The one window recompute, cached until `version` or `narrowed` change
  const metrics = $derived.by(() => {
    void version;
    reduceList(
      listState,
      { kind: LIST_ACTION_KIND.refreshMetrics },
      listInputs(),
    );
    return listState.metrics;
  });

  const commitSignature = $derived.by(() => {
    void metrics;
    return listEffectSignature(listState);
  });

  // The list above hands its scope down, this list hands its own to the lists in its cells
  const nesting: IListNesting<ItemT> = createListNesting<ItemT>({
    parent: getVirtualizedListScope(),
    horizontal: narrowed.horizontal,
    getState: () => listState,
    dispatch,
    getContainerNode: () => hostShim?.engineNode ?? null,
    getHasMore: () => listHasMore(listState),
    keyFor,
    handlers: () => handlers,
  });
  setVirtualizedListScope(nesting.scope);

  const handlers: IListHandlers = createListHandlers<ItemT>({
    isHorizontal: () => narrowed.horizontal,
    user: () => narrowed,
    nesting: () => nesting,
    dispatch,
    clearCommandedOffset: () => {
      commandedOffset = undefined;
    },
    getNode: () => hostShim?.engineNode ?? null,
    keyFor,
  });
  const makeCellMeasure = handlers.makeCellMeasure;

  function makeCellFocus(index: number): () => void {
    return (): void => dispatch({ kind: LIST_ACTION_KIND.cellFocused, index });
  }

  function mergeSeparator(
    gapIndex: number,
    patch: Partial<ISeparatorProps<ItemT>>,
  ): void {
    if (!isSeparatorGapInRange(gapIndex, listState.metrics.count)) return;
    separatorOverrides.set(gapIndex, {
      ...separatorOverrides.get(gapIndex),
      ...patch,
    });
    separatorVersion += 1;
  }

  // Instance exports for `bind:this`, the twin of React's `useImperativeHandle`
  const handle = buildListHandle({
    dispatch,
    scrollHandle,
    getNode: () => hostShim?.engineNode ?? null,
  });
  export function scrollToOffset(
    ...args: Parameters<IVirtualizedListHandle['scrollToOffset']>
  ): void {
    handle.scrollToOffset(...args);
  }
  export function scrollToIndex(
    ...args: Parameters<IVirtualizedListHandle['scrollToIndex']>
  ): void {
    handle.scrollToIndex(...args);
  }
  export function scrollToItem(
    ...args: Parameters<IVirtualizedListHandle['scrollToItem']>
  ): void {
    handle.scrollToItem(...args);
  }
  export function scrollToEnd(
    ...args: Parameters<IVirtualizedListHandle['scrollToEnd']>
  ): void {
    handle.scrollToEnd(...args);
  }
  export function flashScrollIndicators(): void {
    handle.flashScrollIndicators();
  }
  export function recordInteraction(): void {
    handle.recordInteraction();
  }
  export function getNativeScrollRef(): ISymbioteNode | null {
    return handle.getNativeScrollRef();
  }
  export function getScrollableNode(): IScrollViewHandle | null {
    return handle.getScrollableNode();
  }
  export function getScrollResponder(): IScrollViewHandle | null {
    return handle.getScrollResponder();
  }
  export function getScrollNode(): ISymbioteNode | null {
    return handle.getScrollNode();
  }
  export function getScrollRef(): ISymbioteNode | null {
    return handle.getScrollRef();
  }

  // The after-commit pass, runs the deferred effects when the windowing signature changes
  $effect(() => {
    void commitSignature;
    const result = reduceList(
      listState,
      { kind: LIST_ACTION_KIND.commit },
      listInputs(),
    );
    runListEffects(result.effects, effectHost);
  });

  // No reactive reads, so it runs once on mount and its cleanup runs on destroy
  $effect(() => {
    return () => {
      clearTimers([viewableTimer, batchTimer]);
      nesting.detach();
    };
  });

  // One prop (`p={bag}`) lands on the host tag, the bag is built field by field
  const outerBag = $derived(
    buildListScrollProps(
      {
        ...narrowed,
        total: metrics.total,
        hasHeader,
        commandedOffset,
        onScroll: handlers.onScroll,
        onScrollBeginDrag: handlers.onScrollBeginDrag,
        onScrollEndDrag: handlers.onScrollEndDrag,
        onMomentumScrollBegin: handlers.onMomentumScrollBegin,
        onMomentumScrollEnd: handlers.onMomentumScrollEnd,
        onContentSizeChange: handlers.onContentSizeChange,
        onLayout: handlers.onViewportLayout,
      },
      { ...pickAccessibilityProps(props), class: narrowed.class },
    ),
  );
  // The list above scrolls, so RN renders a `View` with no content container
  const nestedBag = $derived({
    ...pickAccessibilityProps(props),
    class: narrowed.class,
    style: narrowed.style,
    onLayout: handlers.onViewportLayout,
  });

  const refreshControlProps = $derived(refreshControlPropsOf(narrowed));
  const hasHeader = $derived(props.header !== undefined);
  // One keyed walk over spacers and cells, a cell moving between regions keeps its instance
  const windowPlan = $derived.by(() => {
    void separatorVersion;
    if (metrics.count === FIRST_INDEX) return null;
    return planFromMetrics(metrics, keyFor, narrowed.stickyHeaderIndices);
  });
  const plan = $derived(windowPlan?.plan ?? null);
  const stickySet = $derived(windowPlan?.stickySet);
  const cellStyle = $derived(cellStyleOf(narrowed));
  const headerStyle = $derived(
    listStyleOf(narrowed, narrowed.listHeaderComponentStyle),
  );
  const footerStyle = $derived(
    listStyleOf(narrowed, narrowed.listFooterComponentStyle),
  );

  // Reads `separatorVersion`, a plain Map read alone would not re-track
  function separatorPropsFor(index: number): ISeparatorProps<ItemT> {
    void separatorVersion;
    return buildSeparatorProps(
      narrowed.getItem(narrowed.data, index),
      narrowed.getItem(narrowed.data, index + 1),
      separatorOverrides.get(index),
    );
  }

  function separatorsFor(index: number): ISeparators {
    return buildSeparatorHandles(index, mergeSeparator);
  }
</script>

{#snippet cellContent(index: number)}
  {@const info = {
    item: narrowed.getItem(narrowed.data, index),
    index,
    separators: separatorsFor(index),
  }}
  {@const ListItem = itemComponentOf(props)}
  {#if ListItem}
    <ListItem {...info} />
  {:else}
    {@render props.item?.(info)}
  {/if}
  {#if props.separator && index < metrics.count - 1}
    <view p={{}}>
      {@render props.separator(separatorPropsFor(index))}
    </view>
  {/if}
{/snippet}

{#snippet listBody()}
  <!-- The shim drops the whitespace text nodes between these siblings (dom-shim/text.ts) -->
  {#if hasHeader}
    <view p={{ style: headerStyle }}>
      {@render props.header?.()}
    </view>
  {/if}
  {#if metrics.count === FIRST_INDEX}
    {#if props.empty}
      <view p={{ style: cellStyle }}>
        {@render props.empty()}
      </view>
    {/if}
  {:else if plan}
    {#each plan.segments as segment (segment.kind + segment.key)}
      {#if segment.kind === LIST_SEGMENT_KIND.spacer}
        {#if segment.extent > EMPTY_OFFSET}
          <view
            p={{ style: spacerStyleOf(segment.extent, narrowed.horizontal) }}
          />
        {/if}
      {:else if props.cellRenderer}
        {#snippet customCell()}
          {@render props.cellRenderer?.({
            cellKey: segment.key,
            index: segment.index,
            item: props.getItem(props.data, segment.index),
            style: cellStyle,
            onLayout: makeCellMeasure(segment.index),
            onFocus: makeCellFocus(segment.index),
            children: cellChildren,
          })}
        {/snippet}
        {#snippet cellChildren()}
          {@render cellContent(segment.index)}
        {/snippet}
        {#if stickySet?.has(segment.index)}
          <!-- RN pins the custom component itself, the sticky tag only holds it -->
          <sticky-header>
            {@render customCell()}
          </sticky-header>
        {:else}
          {@render customCell()}
        {/if}
      {:else if stickySet?.has(segment.index)}
        <!-- The tag, not a component, it pins by document order so it survives windowing -->
        <sticky-header
          p={{
            onLayout: makeCellMeasure(segment.index),
            onFocus: makeCellFocus(segment.index),
          }}
        >
          {@render cellContent(segment.index)}
        </sticky-header>
      {:else}
        <view
          p={{
            onLayout: makeCellMeasure(segment.index),
            onFocus: makeCellFocus(segment.index),
            style: cellStyle,
          }}
        >
          {@render cellContent(segment.index)}
        </view>
      {/if}
    {/each}
  {/if}
  {#if props.footer}
    <view p={{ style: footerStyle }}>
      {@render props.footer()}
    </view>
  {/if}
{/snippet}

{#snippet scrollBody()}
  <!-- RefreshControl is an ordinary child, the behavior claims it on both platforms -->
  {#if refreshControlProps !== undefined}
    <refresh-control p={refreshControlProps} />
  {/if}
  {@render listBody()}
{/snippet}

{#if nesting.isNested}
  <view p={nestedBag} bind:this={hostShim}>
    {@render listBody()}
  </view>
{:else if narrowed.horizontal}
  <horizontal-scroll-view p={outerBag} bind:this={hostShim}>
    {@render scrollBody()}
  </horizontal-scroll-view>
{:else}
  <scroll-view p={outerBag} bind:this={hostShim}>
    {@render scrollBody()}
  </scroll-view>
{/if}
