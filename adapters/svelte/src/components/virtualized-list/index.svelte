<script lang="ts" module>
  // VirtualizedList: real windowing over a hand-authored minimal scroll host. Only cells whose
  // computed offset falls inside the visible window (plus a leading/trailing buffer) render;
  // the rest collapses into two spacer view nodes.
  //
  // The orchestration - window recompute, edge-reached, viewability, batch fill, MVCP, imperative
  // scrolls - is the framework-agnostic `reduceList` state machine in @symbiote-native/components
  // (state/virtualized-list-reducer), shared verbatim with React/Vue. This file supplies only
  // Svelte's lifecycle: turns native events into ACTIONS, holds one plain (non-reactive) state cell
  // (`listState`), runs the returned EFFECTS with Svelte primitives, and renders the windowed slice
  // with `{#each plan.cells}` (Lists have no Descriptor render fn, per svelte-adapter-dom-shim §15).
  //
  // This file authors the raw `scroll-view` intrinsic directly rather than rendering <ScrollView>:
  // unlike ScrollView.svelte it walks an indexable `plan.cells` list instead of an opaque children
  // Snippet, so it can mark sticky cells itself.
  //
  // It does NOT author the CONTENT node. `registerScrollViewBehavior()` puts a `buildStructure` on
  // the scroll tags, and exactly one thing may build `RCTScrollContentView` — emitting one here as
  // well nests a second one inside the engine's. Everything that used to live here because the
  // content node did (`contentContainerStyle`, the axis base style, `nestedScrollEnabled`, the
  // Android RefreshControl wrap style-split, the JS sticky-header wrapping and its collision map)
  // is the behavior's now; `contentContainerStyle` travels as an OWNER prop and the behavior
  // renames it onto the slot.
  //
  // RefreshControl is written as an ordinary child of the scroll tag on both platforms: the
  // behavior CLAIMS it, keeping it beside the content view on iOS and wrapping the scroll view
  // with it on Android.
  //
  // `<svelte:element>` is forbidden (svelte-adapter-dom-shim skill §4/§7 - its shim surface isn't
  // implemented), so the horizontal/vertical choice is two static branches sharing one
  // `{#snippet listBody()}`, not a dynamic tag.
  import type {
    IVirtualizedListProps,
    IVirtualizedListHandle,
  } from './virtualized-list-props';

  export type { IVirtualizedListProps, IVirtualizedListHandle };
</script>

<script lang="ts" generics="ItemT">
  import {
    DEFAULT_END_REACHED_THRESHOLD,
    DEFAULT_INITIAL_NUM_TO_RENDER,
    DEFAULT_MAX_TO_RENDER_PER_BATCH,
    DEFAULT_START_REACHED_THRESHOLD,
    DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
    DEFAULT_WINDOW_SIZE,
    EMPTY_OFFSET,
    FIRST_INDEX,
    INVERTED_X_STYLE,
    INVERTED_Y_STYLE,
    buildListPlan,
    buildScrollViewHandle,
    buildViewabilityPairs,
    createInitialListState,
    isSeparatorGapInRange,
    listEffectSignature,
    readLayoutLength,
    readLayoutOffset,
    readScrollOffset,
    reduceList,
    resolveItemKey,
    type IListAction,
    type IListEffect,
    type IListReducerInputs,
    type IListState,
    type IScrollViewHandle,
    type ISeparatorProps,
    type ISeparators,
  } from '@symbiote-native/components';
  import {
    dlog,
    type ISymbioteEvent,
    type ISymbioteNode,
  } from '@symbiote-native/engine';
  import type { ShimElement } from '../../dom-shim';
  import RefreshControl from '../RefreshControl.svelte';
  import {
    pickAccessibilityProps,
    type IVirtualizedListProps as IProps,
  } from './virtualized-list-props';
  import { createAttachmentsSync } from '../../runes/attachments';

  let props: IProps<ItemT> = $props();

  // $state.raw, NOT $state: holds the shim element by IDENTITY (same concern as Switch's
  // hostShim / Vue's shallowRef scrollHandle). dispatchViewCommand reads `.engineNode` off the RAW
  // ShimElement the engine's WeakMap mirror actually knows about.
  let hostShim = $state.raw<ShimElement | null>(null);

  // See View.svelte's note on `{@attach}` - bound to the scroll host, the node a caller
  // means by "the list" (the same node getScrollNode()/scrollTo drive).
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, props);
  });

  // Offset we're imperatively driving native to before hostShim's engine node is live. Fresh
  // object identity each push so the commit path re-applies it even when the value repeats.
  let commandedOffset = $state.raw<{ x: number; y: number } | undefined>(
    undefined,
  );
  // Bumped on a render-relevant change so `metrics` re-runs - listState is a PLAIN object
  // (not $state), mutating it triggers nothing on its own.
  let version = $state(0);
  let separatorVersion = $state(0);

  const scrollHandle: IScrollViewHandle = buildScrollViewHandle(
    () => hostShim?.engineNode ?? null,
  );

  // The one folded state cell — the Svelte twin of Vue's plain listState / React's stateRef.
  const listState: IListState<ItemT> = createInitialListState<ItemT>();
  const separatorOverrides = new Map<number, Partial<ISeparatorProps<ItemT>>>();
  let viewableTimer: ReturnType<typeof setTimeout> | null = null;
  let batchTimer: ReturnType<typeof setTimeout> | null = null;

  const narrowed = $derived.by(() => {
    // extraData has no field of its own; reading it tracks it so a change forces this derived to
    // re-run (RN's extraData contract).
    void props.extraData;
    return {
      data: props.data,
      getItem: props.getItem,
      getItemCount: props.getItemCount,
      keyExtractor: props.keyExtractor,
      getItemLayout: props.getItemLayout,
      horizontal: props.horizontal === true,
      inverted: props.inverted === true,
      onEndReached: props.onEndReached,
      onEndReachedThreshold:
        props.onEndReachedThreshold ?? DEFAULT_END_REACHED_THRESHOLD,
      onStartReached: props.onStartReached,
      onStartReachedThreshold:
        props.onStartReachedThreshold ?? DEFAULT_START_REACHED_THRESHOLD,
      onRefresh: props.onRefresh,
      refreshing: props.refreshing,
      progressViewOffset: props.progressViewOffset,
      onViewableItemsChanged: props.onViewableItemsChanged,
      viewabilityConfig: props.viewabilityConfig,
      viewabilityConfigCallbackPairs: props.viewabilityConfigCallbackPairs,
      onScrollToIndexFailed: props.onScrollToIndexFailed,
      initialNumToRender:
        props.initialNumToRender ?? DEFAULT_INITIAL_NUM_TO_RENDER,
      initialScrollIndex: props.initialScrollIndex,
      maxToRenderPerBatch:
        props.maxToRenderPerBatch ?? DEFAULT_MAX_TO_RENDER_PER_BATCH,
      updateCellsBatchingPeriod:
        props.updateCellsBatchingPeriod ?? DEFAULT_UPDATE_CELLS_BATCHING_PERIOD,
      windowSize: props.windowSize ?? DEFAULT_WINDOW_SIZE,
      stickyHeaderIndices: props.stickyHeaderIndices,
      maintainVisibleContentPosition: props.maintainVisibleContentPosition,
      userOnScroll: props.onScroll,
      onScrollBeginDrag: props.onScrollBeginDrag,
      onScrollEndDrag: props.onScrollEndDrag,
      onMomentumScrollBegin: props.onMomentumScrollBegin,
      onMomentumScrollEnd: props.onMomentumScrollEnd,
      scrollEventThrottle: props.scrollEventThrottle,
      keyboardShouldPersistTaps: props.keyboardShouldPersistTaps,
      keyboardDismissMode: props.keyboardDismissMode,
      style: props.style,
      contentContainerStyle: props.contentContainerStyle,
      class: props.class,
    };
  });

  function buildInputs(): IListReducerInputs<ItemT> {
    const p = narrowed;
    return {
      data: p.data,
      getItem: p.getItem,
      getItemCount: p.getItemCount,
      keyExtractor: p.keyExtractor,
      getItemLayout: p.getItemLayout,
      horizontal: p.horizontal,
      windowSize: p.windowSize,
      initialNumToRender: p.initialNumToRender,
      maxToRenderPerBatch: p.maxToRenderPerBatch,
      updateCellsBatchingPeriod: p.updateCellsBatchingPeriod,
      onEndReachedThreshold: p.onEndReachedThreshold,
      onStartReachedThreshold: p.onStartReachedThreshold,
      onEndReachedActive: p.onEndReached !== undefined,
      onStartReachedActive: p.onStartReached !== undefined,
      viewabilityPairs: buildViewabilityPairs(
        p.onViewableItemsChanged,
        p.viewabilityConfig,
        p.viewabilityConfigCallbackPairs,
      ),
      maintainVisibleContentPosition: p.maintainVisibleContentPosition,
      initialScrollIndex: p.initialScrollIndex,
    };
  }

  function keyFor(index: number): string {
    return resolveItemKey(
      narrowed.getItem(narrowed.data, index),
      index,
      narrowed.keyExtractor,
    );
  }

  function scrollToPixel(offset: number, animated: boolean): void {
    const clamped = Math.max(EMPTY_OFFSET, offset);
    const target = narrowed.horizontal
      ? { x: clamped, y: EMPTY_OFFSET }
      : { x: EMPTY_OFFSET, y: clamped };
    if (hostShim?.engineNode === undefined) {
      dlog(`VirtualizedList scrollTo offset=${clamped} pending-ref`);
      commandedOffset = target;
      return;
    }
    commandedOffset = undefined;
    dlog(
      `VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${narrowed.horizontal})`,
    );
    scrollHandle.scrollTo({ x: target.x, y: target.y, animated });
  }

  function runEffects(
    effects: IListEffect<ItemT>[],
    inputs: IListReducerInputs<ItemT>,
  ): void {
    const p = narrowed;
    for (const effect of effects) {
      switch (effect.kind) {
        case 'scroll-to':
          scrollToPixel(effect.offset, effect.animated);
          break;
        case 'fire-end-reached':
          p.onEndReached?.({ distanceFromEnd: effect.distanceFromEnd });
          break;
        case 'fire-start-reached':
          p.onStartReached?.({ distanceFromStart: effect.distanceFromStart });
          break;
        case 'fire-scroll-to-index-failed':
          p.onScrollToIndexFailed?.({
            index: effect.index,
            highestMeasuredFrameIndex: effect.highestMeasuredFrameIndex,
            averageItemLength: effect.averageItemLength,
          });
          break;
        case 'schedule-refill': {
          if (batchTimer !== null) clearTimeout(batchTimer);
          batchTimer = setTimeout(() => {
            batchTimer = null;
            dispatch({ kind: 'batch-tick' });
          }, effect.delay);
          break;
        }
        case 'fire-viewable': {
          const pairs = inputs.viewabilityPairs;
          const info = effect.info;
          const map = effect.map;
          const fire = (): void => {
            for (const pair of pairs) pair.onViewableItemsChanged(info);
            dispatch({ kind: 'viewable-fired', map });
          };
          if (viewableTimer !== null) {
            clearTimeout(viewableTimer);
            viewableTimer = null;
          }
          if (effect.delay > EMPTY_OFFSET) {
            viewableTimer = setTimeout(() => {
              viewableTimer = null;
              fire();
            }, effect.delay);
          } else {
            fire();
          }
          break;
        }
      }
    }
  }

  function dispatch(action: IListAction<ItemT>): void {
    const inputs = buildInputs();
    const result = reduceList(listState, action, inputs);
    runEffects(result.effects, inputs);
    if (result.changed) version += 1;
  }

  // The window is recomputed exactly once here (refresh-metrics), cached until `version` or
  // `narrowed` change - the Svelte twin of Vue's `metrics` computed.
  const metrics = $derived.by(() => {
    void version;
    reduceList(listState, { kind: 'refresh-metrics' }, buildInputs());
    return listState.metrics;
  });

  const commitSignature = $derived.by(() => {
    void metrics;
    return listEffectSignature(listState);
  });

  function handleScroll(event: ISymbioteEvent): void {
    const offset = readScrollOffset(event, narrowed.horizontal);
    if (offset === undefined) return;
    dlog(`VirtualizedList onScroll offset=${offset}`);
    commandedOffset = undefined;
    dispatch({ kind: 'scroll', offset });
    narrowed.userOnScroll?.(event);
  }

  function onViewportLayout(event: ISymbioteEvent): void {
    const length = readLayoutLength(event, narrowed.horizontal);
    if (length === undefined) return;
    dlog(`VirtualizedList onLayout viewport=${length}`);
    dispatch({ kind: 'layout', length });
  }

  function makeCellMeasure(index: number): (event: ISymbioteEvent) => void {
    return (event: ISymbioteEvent): void => {
      const length = readLayoutLength(event, narrowed.horizontal);
      if (length === undefined) return;
      const offset = readLayoutOffset(event, narrowed.horizontal);
      dlog(
        `VirtualizedList cell ${index} measured length=${length} offset=${offset ?? 'none'}`,
      );
      dispatch({ kind: 'measure', index, length, offset });
    };
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

  function makeSeparators(index: number): ISeparators {
    return {
      highlight: (): void => {
        dlog(`VirtualizedList separator highlight cell=${index}`);
        mergeSeparator(index - 1, { highlighted: true });
        mergeSeparator(index, { highlighted: true });
      },
      unhighlight: (): void => {
        dlog(`VirtualizedList separator unhighlight cell=${index}`);
        mergeSeparator(index - 1, { highlighted: false });
        mergeSeparator(index, { highlighted: false });
      },
      updateProps: (
        select: 'leading' | 'trailing',
        newProps: Record<string, unknown>,
      ): void => {
        mergeSeparator(select === 'leading' ? index - 1 : index, newProps);
      },
    };
  }

  // ---- imperative handle: component instance exports, the Svelte twin of Vue's expose() /
  // React's useImperativeHandle. A parent does `<VirtualizedList bind:this={ref} .../>` and calls
  // `ref.scrollToIndex(...)`. ----
  export function scrollToOffset(params: {
    offset: number;
    animated?: boolean;
  }): void {
    dispatch({
      kind: 'scroll-to-offset',
      offset: params.offset,
      animated: params.animated ?? true,
    });
  }
  export function scrollToIndex(params: {
    index: number;
    animated?: boolean;
    viewOffset?: number;
    viewPosition?: number;
  }): void {
    dispatch({
      kind: 'scroll-to-index',
      index: params.index,
      animated: params.animated ?? true,
      viewPosition: params.viewPosition ?? FIRST_INDEX,
      viewOffset: params.viewOffset ?? EMPTY_OFFSET,
    });
  }
  export function scrollToItem(params: {
    item: unknown;
    animated?: boolean;
    viewPosition?: number;
  }): void {
    dispatch({
      kind: 'scroll-to-item',
      item: params.item,
      animated: params.animated ?? true,
      viewPosition: params.viewPosition ?? FIRST_INDEX,
    });
  }
  export function scrollToEnd(params?: { animated?: boolean }): void {
    dispatch({ kind: 'scroll-to-end', animated: params?.animated ?? true });
  }
  export function flashScrollIndicators(): void {
    scrollHandle.flashScrollIndicators();
  }
  export function getNativeScrollRef(): IScrollViewHandle | null {
    return scrollHandle;
  }
  export function getScrollableNode(): IScrollViewHandle | null {
    return scrollHandle;
  }
  export function getScrollResponder(): IScrollViewHandle | null {
    return scrollHandle;
  }
  export function getScrollNode(): ISymbioteNode | null {
    return scrollHandle.getScrollNode();
  }
  export function recordInteraction(): void {
    dispatch({ kind: 'record-interaction' });
  }

  // ---- after-commit pass: runs the deferred effects (batch fill, edge-reached, viewability,
  // initial-scroll, MVCP) whenever the windowing signature changes. $effect runs after the DOM
  // update lands, the same after-commit timing Vue's `flush: 'post'` watcher and React's layout
  // effect give the reducer. ----
  $effect(() => {
    void commitSignature;
    const inputs = buildInputs();
    const result = reduceList(listState, { kind: 'commit' }, inputs);
    runEffects(result.effects, inputs);
  });

  // Clear pending timers on unmount (RN ViewabilityHelper.dispose + the fill timer). A bare
  // `$effect` with no reactive reads runs once on mount; its returned cleanup runs on destroy -
  // the Svelte twin of Vue's onBeforeUnmount.
  $effect(() => {
    return () => {
      if (viewableTimer !== null) clearTimeout(viewableTimer);
      if (batchTimer !== null) clearTimeout(batchTimer);
    };
  });

  const resolvedStyle = $derived(
    narrowed.inverted
      ? [
          narrowed.style,
          narrowed.horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE,
        ]
      : narrowed.style,
  );
  // Travels on the OWNER: `slotProps` renames it onto the content node the behavior built, so it
  // goes through the slot's own routeProp and inherits class resolution and style merging. The
  // horizontal `flexDirection: 'row'` is the behavior's constant and is composed OVER this, so
  // only the measured total width is added here.
  const resolvedContentContainerStyle = $derived(
    narrowed.horizontal
      ? [narrowed.contentContainerStyle, { width: metrics.total }]
      : narrowed.contentContainerStyle,
  );

  const outerBag = $derived.by(() => {
    const bag: Record<string, unknown> = {
      style: resolvedStyle,
      class: narrowed.class,
      contentContainerStyle: resolvedContentContainerStyle,
      onScroll: handleScroll,
      onLayout: onViewportLayout,
    };
    if (commandedOffset !== undefined) bag.contentOffset = commandedOffset;
    // The RAW prop. A sticky header raises the throttle from the behavior, once it has actually
    // registered — folding a sticky default in here would hand the behavior a number it reads back
    // as the app's and could never take away again.
    if (narrowed.scrollEventThrottle !== undefined)
      bag.scrollEventThrottle = narrowed.scrollEventThrottle;
    if (narrowed.onScrollBeginDrag !== undefined)
      bag.onScrollBeginDrag = narrowed.onScrollBeginDrag;
    if (narrowed.onScrollEndDrag !== undefined)
      bag.onScrollEndDrag = narrowed.onScrollEndDrag;
    if (narrowed.onMomentumScrollBegin !== undefined)
      bag.onMomentumScrollBegin = narrowed.onMomentumScrollBegin;
    if (narrowed.onMomentumScrollEnd !== undefined)
      bag.onMomentumScrollEnd = narrowed.onMomentumScrollEnd;
    if (narrowed.keyboardShouldPersistTaps !== undefined) {
      bag.keyboardShouldPersistTaps = narrowed.keyboardShouldPersistTaps;
    }
    if (narrowed.keyboardDismissMode !== undefined)
      bag.keyboardDismissMode = narrowed.keyboardDismissMode;
    // `stickyHeaderIndices` is deliberately NOT forwarded. The behavior honours it by numbering the
    // owner's own PAINT children, and this list's indices are into the DATA stream — a windowed
    // list paints a spacer, a header and a slice, so index 3 of the data is almost never paint
    // child 3. The cells that should pin carry the `sticky-header` tag directly instead, which is
    // the one form that survives windowing.
    if (narrowed.maintainVisibleContentPosition !== undefined) {
      bag.maintainVisibleContentPosition =
        narrowed.maintainVisibleContentPosition;
    }
    // Object.assign merges a bag already built field-by-field (pickAccessibilityProps), not a raw
    // spread of `props`, so this stays inside the object-bag convention (svelte-adapter-dom-shim
    // skill §3g(c)) - only ONE prop (`p={bag}`) ever lands on the symbiote-* host tag.
    Object.assign(bag, pickAccessibilityProps(props));
    return bag;
  });

  // Build the real RefreshControl's own prop bag when onRefresh is set; refreshing defaults to
  // false when nullish, same as RN/React.
  const refreshControlProps = $derived.by(() => {
    if (narrowed.onRefresh === undefined) return undefined;
    return {
      refreshing: narrowed.refreshing ?? false,
      onRefresh: narrowed.onRefresh,
      progressViewOffset: narrowed.progressViewOffset,
    };
  });
  const stickySet = $derived(
    narrowed.stickyHeaderIndices !== undefined
      ? new Set(narrowed.stickyHeaderIndices)
      : undefined,
  );
  $effect(() => {
    dlog(
      `VirtualizedList sticky stickyHeaderIndices=${JSON.stringify(narrowed.stickyHeaderIndices)} ` +
        `first=${metrics.first} last=${metrics.last} windowedCells=${JSON.stringify(plan?.cells.map(c => c.index))} ` +
        `forcedStickyCell=${plan?.forcedStickyCell?.index ?? 'none'} gapExtent=${plan?.gapExtent ?? 0} ` +
        `allCells=${JSON.stringify(allCells.map(c => c.index))}`,
    );
  });
  const hasHeader = $derived(props.header !== undefined);
  const plan = $derived.by(() => {
    void separatorVersion;
    if (metrics.count === FIRST_INDEX) return null;
    return buildListPlan({
      count: metrics.count,
      first: metrics.first,
      last: metrics.last,
      offsets: metrics.offsets,
      lengths: metrics.lengths,
      total: metrics.total,
      keyFor,
      stickyIndices: stickySet,
      hasHeader,
    });
  });
  // forcedStickyCell prepended to the window cells so BOTH walk through the SAME keyed {#each}.
  // A Svelte {#if}/{#each} split is two different template positions with no shared component
  // identity, so a header toggling between "forced ahead of the window" and "inside the window"
  // would get destroyed and recreated (losing its measured layout, back to its default
  // translateY) - one keyed list keeps the SAME instance across that transition, by cell.key.
  const allCells = $derived(
    plan?.forcedStickyCell !== undefined && plan !== null
      ? [plan.forcedStickyCell, ...plan.cells]
      : (plan?.cells ?? []),
  );
  const cellInvertedStyle = $derived(
    narrowed.inverted
      ? narrowed.horizontal
        ? INVERTED_X_STYLE
        : INVERTED_Y_STYLE
      : undefined,
  );

  // Reads separatorVersion so a .highlight()/.unhighlight()/.updateProps() call (ISeparators, above)
  // reactively refreshes this cell's separator props - a plain object literal inlined in the
  // template would NOT re-track separatorOverrides (a non-reactive Map) on its own.
  function separatorPropsFor(index: number): ISeparatorProps<ItemT> {
    void separatorVersion;
    const overrides = separatorOverrides.get(index);
    return {
      highlighted: overrides?.highlighted === true,
      leadingItem: narrowed.getItem(narrowed.data, index),
      trailingItem: narrowed.getItem(narrowed.data, index + 1),
      ...overrides,
    };
  }
</script>

{#snippet listBody()}
  <!--
  Svelte keeps the whitespace between the sibling blocks below as ' ' text nodes; the shim drops
  each one because this scroll content takes no raw text (dom-shim/text.ts, §16b). That is what
  lets virtualized-list.smoke.test.ts still assert an exact windowed child count.
-->
  {#if hasHeader}
    <view p={{}}>
      {@render props.header?.()}
    </view>
  {/if}
  {#if metrics.count === FIRST_INDEX}
    {#if props.empty}
      <view p={{}}>
        {@render props.empty()}
      </view>
    {/if}
  {:else if plan}
    {#if plan.leadingExtent > EMPTY_OFFSET}
      <view
        p={{
          style: narrowed.horizontal
            ? { width: plan.leadingExtent }
            : { height: plan.leadingExtent },
        }}
      />
    {/if}
    {#each allCells as cell (cell.key)}
      {#if stickySet?.has(cell.index)}
        <!-- The TAG, not a component: `registerScrollViewBehavior()` registers `sticky-header`
             alongside the scroll tags, and its behavior finds this ScrollView by walking up. The
             collision point comes from the owner's DOCUMENT order, so nothing here computes or
             forwards an index. `onLayout` is forwarded by the behavior, not replaced. -->
        <sticky-header onLayout={makeCellMeasure(cell.index)}>
          {@render props.item({
            item: narrowed.getItem(narrowed.data, cell.index),
            index: cell.index,
            separators: makeSeparators(cell.index),
          })}
          {#if props.separator && cell.index < metrics.count - 1}
            <view p={{}}>
              {@render props.separator(separatorPropsFor(cell.index))}
            </view>
          {/if}
        </sticky-header>
      {:else}
        <view
          p={{
            onLayout: makeCellMeasure(cell.index),
            style: cellInvertedStyle,
          }}
        >
          {@render props.item({
            item: narrowed.getItem(narrowed.data, cell.index),
            index: cell.index,
            separators: makeSeparators(cell.index),
          })}
          {#if props.separator && cell.index < metrics.count - 1}
            <view p={{}}>
              {@render props.separator(separatorPropsFor(cell.index))}
            </view>
          {/if}
        </view>
      {/if}
      {#if plan.forcedStickyCell && cell.index === plan.forcedStickyCell.index && plan.gapExtent > EMPTY_OFFSET}
        <view
          p={{
            style: narrowed.horizontal
              ? { width: plan.gapExtent }
              : { height: plan.gapExtent },
          }}
        />
      {/if}
    {/each}
    {#if plan.trailingExtent > EMPTY_OFFSET}
      <view
        p={{
          style: narrowed.horizontal
            ? { width: plan.trailingExtent }
            : { height: plan.trailingExtent },
        }}
      />
    {/if}
  {/if}
  {#if props.footer}
    <view p={{}}>
      {@render props.footer()}
    </view>
  {/if}
{/snippet}

{#snippet scrollBody()}
  <!--
  Same as listBody() above: the RefreshControl and the cells are siblings of one parent here, and
  the whitespace between them is dropped before it reaches Fabric.

  RefreshControl is written as an ordinary child on BOTH platforms — the behavior CLAIMS it, so
  the engine keeps it beside the content view on iOS and inverts the tree on Android. Everything
  after it lands in the content node the behavior built.
-->
  {#if refreshControlProps !== undefined}
    <RefreshControl {...refreshControlProps} />
  {/if}
  {@render listBody()}
{/snippet}

{#if narrowed.horizontal}
  <horizontal-scroll-view p={outerBag} bind:this={hostShim}>
    {@render scrollBody()}
  </horizontal-scroll-view>
{:else}
  <scroll-view p={outerBag} bind:this={hostShim}>
    {@render scrollBody()}
  </scroll-view>
{/if}
