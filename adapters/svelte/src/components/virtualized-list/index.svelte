<script lang="ts" module>
  // VirtualizedList: real windowing over a hand-authored minimal scroll host. Only the cells whose
  // computed offset falls inside the visible window (plus a leading/trailing buffer) are rendered;
  // everything above/below collapses into two spacer symbiote-view nodes.
  //
  // The orchestration — window recompute, edge-reached, viewability, batch fill, MVCP, the
  // imperative scrolls — is the framework-agnostic `reduceList` state machine in
  // @symbiote-native/components (state/virtualized-list-reducer), shared verbatim with React/Vue.
  // This file supplies only Svelte's lifecycle: it turns native events into ACTIONS, holds ONE
  // plain (non-reactive) state cell (`listState`, the Svelte twin of Vue's plain listState / React's
  // stateRef), runs the returned EFFECTS with Svelte primitives (dispatchViewCommand, a callback, a
  // setTimeout, a `version` bump), and renders the windowed slice with `{#each plan.cells}` — Svelte's
  // own idiomatic dynamic-list construct, per the svelte-adapter-dom-shim skill §15 finding that
  // Lists have no Descriptor render fn and were always meant to be hand-assembled with the
  // framework's native loop.
  //
  // A real ScrollView.svelte now exists in this adapter, but this file still hand-authors the raw
  // `symbiote-scroll-view`/`symbiote-scroll-content` intrinsics directly — the same pair React's
  // ScrollView wraps internally (adapters/react/src/components/scroll-view/shared.ts
  // selectScrollIntrinsics) — rather than being swapped over to render <ScrollView> the way
  // React's/Vue's VirtualizedList render THEIR ScrollView component. `onContentSizeChange` remains
  // the one honest gap left from that; everything else a bare intrinsic host would miss —
  // nestedScrollEnabled, the Android RefreshControl wrap style-split, JS sticky-header wrapping —
  // is now wired directly in this file instead (unlike ScrollView.svelte, this file walks an
  // indexable `plan.cells` list rather than an opaque children Snippet, so it CAN auto-wrap sticky
  // cells itself; see the sticky wiring below).
  //
  // RefreshControl IS wired (onRefresh/refreshing/progressViewOffset): it attaches directly to
  // these raw scroll intrinsics — a real `RefreshControl.svelte` sibling before the content on iOS,
  // wrapping the whole scroll view on Android (PLATFORM.refreshControlMode) — the same sibling/wrap
  // shape ScrollView's own index.svelte uses, just against the raw intrinsic instead of a
  // `<ScrollView>` component reference.
  //
  // `<svelte:element>` remains legal under the custom-renderer API (svelte-adapter-custom-renderer
  // skill §7 — only its a11y check is skipped, the dynamic-tag mechanism itself is untouched), but
  // this file still keeps the horizontal/vertical intrinsic choice as two static branches sharing
  // one local `{#snippet listBody()}` rather than switching to a dynamic tag — no functional need
  // to change a working design just because the option opened up.
  import type { IVirtualizedListProps, IVirtualizedListHandle } from './virtualized-list-props';

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
    attachStickyScroll,
    buildListPlan,
    buildScrollViewHandle,
    buildViewabilityPairs,
    createInitialListState,
    forwardScrollEvent,
    isSeparatorGapInRange,
    listEffectSignature,
    nextStickyHeaderY,
    readLayoutLength,
    readLayoutNumber,
    readScrollOffset,
    reduceList,
    resolveItemKey,
    resolveScrollForwarding,
    selectScrollIntrinsics,
    splitLayoutProps,
    type IListAction,
    type IListEffect,
    type IListReducerInputs,
    type IListState,
    type IScrollViewHandle,
    type ISeparatorProps,
    type ISeparators,
  } from '@symbiote-native/components';
  import {
    AnimatedValue,
    dlog,
    event as animatedEvent,
    isNativeAnimatedAvailable,
    resolveClassName,
    type IHostInstance,
    type ISymbioteEvent,
    type ISymbioteNode,
  } from '@symbiote-native/engine';
  import { resolveSvelteClass } from '../../class-value';
  import { setContext } from 'svelte';
  import RefreshControl from '../RefreshControl.svelte';
  import { toTemplateSafeProps } from '../../renderer';
  import { PLATFORM } from '../scroll-view/scroll-view-platform';
  import ScrollViewStickyHeader from '../scroll-view/sticky-header.svelte';
  import {
    SCROLL_VIEW_STICKY_CONTEXT_KEY,
    type IScrollViewStickyContext,
  } from '../scroll-view/scroll-view-sticky-context';
  import { pickAccessibilityProps, type IVirtualizedListProps as IProps } from './virtualized-list-props';
  import { createAttachmentsSync } from '../../runes/attachments';

  let props: IProps<ItemT> = $props();

  // $state.raw, NOT $state: holds the host node by IDENTITY (same concern as Switch's hostRef /
  // Vue's shallowRef scrollHandle). dispatchViewCommand reads it directly — a Proxy wrapper would
  // miss the engine's WeakMap-keyed mirror lookup. Nodes are eagerly bound under the custom-
  // renderer API (unlike the retired shim's lazy-until-committed ShimElement), so `hostRef` is
  // already the real, dispatchable engine node the moment `{@attach}` below runs.
  let hostRef = $state.raw<IHostInstance | null>(null);

  // See View.svelte's note on `{@attach}` — bound to the scroll host, the node a caller
  // means by "the list" (the same node getScrollNode()/scrollTo drive).
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostRef, props);
  });

  // The offset we are imperatively driving native to (fallback before `{@attach}` has run and
  // hostRef is still null). Fresh object identity each push so the commit path re-applies it even
  // when the numeric value repeats. undefined = none pending.
  let commandedOffset = $state.raw<{ x: number; y: number } | undefined>(undefined);
  // Bumped when a transition changes render-relevant state, so `metrics` (and the markup that reads
  // it) re-run — listState is a PLAIN object (not $state), mutating it triggers nothing itself.
  let version = $state(0);
  let separatorVersion = $state(0);

  const scrollHandle: IScrollViewHandle = buildScrollViewHandle(() => hostRef);

  // The one folded state cell — the Svelte twin of Vue's plain listState / React's stateRef.
  const listState: IListState<ItemT> = createInitialListState<ItemT>();
  const separatorOverrides = new Map<number, Partial<ISeparatorProps<ItemT>>>();
  let viewableTimer: ReturnType<typeof setTimeout> | null = null;
  let batchTimer: ReturnType<typeof setTimeout> | null = null;

  // Sticky headers: this file hand-rolls the raw scroll intrinsic instead of rendering
  // <ScrollView> (see this file's own header comment), so it can't lean on ScrollView.svelte's
  // sticky wiring — but unlike ScrollView (which only ever sees an opaque children Snippet, see
  // scroll-view-props.ts's KNOWN GAP), THIS file already walks an indexable `plan.cells` list, so
  // auto-wrapping by stickyHeaderIndices is actually possible here. Mirrors ScrollView.svelte's
  // own scrollAnimatedValue/attachStickyScroll/context wiring, applied per-windowed-cell below
  // instead of via manual composition.
  const scrollAnimatedValue = new AnimatedValue(0);
  let viewportHeight = $state<number | undefined>(undefined);
  // y of each measured sticky header, keyed by ORIGINAL list index (RN's _headerLayoutYs) — plain,
  // not $state, mutated in place; stickyVersion (below) drives re-derivation of the collision math
  // that reads it.
  const headerLayoutYs = new Map<number, number>();
  let stickyVersion = $state(0);

  setContext<IScrollViewStickyContext>(SCROLL_VIEW_STICKY_CONTEXT_KEY, {
    scrollAnimatedValue,
    getInverted: () => narrowed.inverted,
    getViewportHeight: () => viewportHeight,
  });

  const narrowed = $derived.by(() => {
    // extraData has no field of its own; reading it tracks it so a change forces this derived to
    // re-run (RN's extraData contract) — see virtualized-list-props.ts's comment on why Svelte's
    // fine-grained reactivity mostly makes the wiring a formality.
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
      onEndReachedThreshold: props.onEndReachedThreshold ?? DEFAULT_END_REACHED_THRESHOLD,
      onStartReached: props.onStartReached,
      onStartReachedThreshold: props.onStartReachedThreshold ?? DEFAULT_START_REACHED_THRESHOLD,
      onRefresh: props.onRefresh,
      refreshing: props.refreshing,
      progressViewOffset: props.progressViewOffset,
      onViewableItemsChanged: props.onViewableItemsChanged,
      viewabilityConfig: props.viewabilityConfig,
      viewabilityConfigCallbackPairs: props.viewabilityConfigCallbackPairs,
      onScrollToIndexFailed: props.onScrollToIndexFailed,
      initialNumToRender: props.initialNumToRender ?? DEFAULT_INITIAL_NUM_TO_RENDER,
      initialScrollIndex: props.initialScrollIndex,
      maxToRenderPerBatch: props.maxToRenderPerBatch ?? DEFAULT_MAX_TO_RENDER_PER_BATCH,
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
    return resolveItemKey(narrowed.getItem(narrowed.data, index), index, narrowed.keyExtractor);
  }

  function scrollToPixel(offset: number, animated: boolean): void {
    const clamped = Math.max(EMPTY_OFFSET, offset);
    const target = narrowed.horizontal
      ? { x: clamped, y: EMPTY_OFFSET }
      : { x: EMPTY_OFFSET, y: clamped };
    if (hostRef === null) {
      dlog(`VirtualizedList scrollTo offset=${clamped} pending-ref`);
      commandedOffset = target;
      return;
    }
    commandedOffset = undefined;
    dlog(`VirtualizedList scrollTo offset=${clamped} animated=${animated} (horizontal=${narrowed.horizontal})`);
    scrollHandle.scrollTo({ x: target.x, y: target.y, animated });
  }

  function runEffects(effects: IListEffect<ItemT>[], inputs: IListReducerInputs<ItemT>): void {
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

  // The single derive-per-render: the window is recomputed exactly once here (refresh-metrics),
  // cached until `version` or `narrowed` change — the Svelte twin of Vue's `metrics` computed /
  // React's `reduceList(state, {kind:'refresh-metrics'}, inputs)` call in the render body.
  const metrics = $derived.by(() => {
    void version;
    reduceList(listState, { kind: 'refresh-metrics' }, buildInputs());
    return listState.metrics;
  });

  const commitSignature = $derived.by(() => {
    void metrics;
    return listEffectSignature(listState);
  });

  const hasStickyHeaders = $derived(
    narrowed.stickyHeaderIndices !== undefined && narrowed.stickyHeaderIndices.length > 0,
  );
  // Resolved dynamically, exactly like React (adapters/react/.../scroll-view/shared.ts:267). This
  // was hardcoded `false` on the theory that making `scrollAnimatedValue` native up front
  // "deadlocks" the header, because AnimatedWithChildren stops cascading listeners into a native
  // subtree. RN has the IDENTICAL gate (AnimatedWithChildren.js:74 `if (!this.__isNative)`) and
  // streams native values back only for AnimatedValue, never for an interpolation — so under RN
  // that listener goes quiet too, and sticky headers still work. It works because the listener
  // does NOT drive the visible pin: the pin is the native transform, and the listener only feeds
  // the debounced committed transform used for hit-testing. Staying on the JS path to keep that
  // listener alive traded the whole native driver for a hit-testing detail — the pin then rode the
  // JS thread, which is why the header lagged on iOS and failed outright on Android (where the
  // commit debounce is 15ms vs iOS's 64ms — render-scroll-sticky.ts).
  const nativeStickyAvailable = $derived(hasStickyHeaders && isNativeAnimatedAvailable());
  // RN's FlatList/SectionList expose no invertStickyHeaders of their own (only ScrollView does) —
  // sticky headers always pin to the top here, matching RN.
  const forwarding = $derived(
    resolveScrollForwarding({
      hasStickyHeaders,
      nativeStickyAvailable,
      invertStickyHeaders: undefined,
      scrollEventThrottle: narrowed.scrollEventThrottle,
      maintainVisibleContentPosition: narrowed.maintainVisibleContentPosition,
      snapToAlignment: undefined,
    }),
  );

  $effect(() => {
    dlog(
      `VirtualizedList sticky hasStickyHeaders=${hasStickyHeaders} nativeStickyAvailable=${nativeStickyAvailable} mode=${forwarding.mode} scrollEventThrottle=${String(forwarding.scrollEventThrottle)}`,
    );
  });

  // Drive the sticky scroll value on the native UI thread once the scroll host commits (mirrors
  // ScrollView.svelte). No-op on a host without the native animated module — the JS fallback below
  // still keeps headers pinned via onScroll.
  $effect(() => {
    if (!nativeStickyAvailable) {
      dlog('VirtualizedList sticky attachStickyScroll skipped: nativeStickyAvailable=false');
      return;
    }
    if (hostRef === null) {
      dlog('VirtualizedList sticky attachStickyScroll skipped: hostRef not attached yet');
      return;
    }
    dlog('VirtualizedList sticky attachStickyScroll attached');
    return attachStickyScroll(hostRef, scrollAnimatedValue);
  });

  function handleScroll(event: ISymbioteEvent): void {
    const offset = readScrollOffset(event, narrowed.horizontal);
    if (offset === undefined) return;
    dlog(`VirtualizedList onScroll offset=${offset}`);
    commandedOffset = undefined;
    dispatch({ kind: 'scroll', offset });
    narrowed.userOnScroll?.(event);
  }

  // sticky-js: no native Animated module, so the scroll value is driven off the JS thread via the
  // same wrapped-listener shape ScrollView.svelte uses. sticky-native/plain: forward untouched (the
  // native driver attaches the value on the UI thread for sticky-native).
  const onScroll = $derived.by(() => {
    if (forwarding.mode !== 'sticky-js') return handleScroll;
    return animatedEvent(
      [{ nativeEvent: { contentOffset: { y: scrollAnimatedValue } } }],
      { listener: (...args: unknown[]) => forwardScrollEvent(handleScroll, args) },
    );
  });

  function onViewportLayout(event: ISymbioteEvent): void {
    const length = readLayoutLength(event, narrowed.horizontal);
    if (length === undefined) return;
    dlog(`VirtualizedList onLayout viewport=${length}`);
    dispatch({ kind: 'layout', length });
    if (forwarding.capturesViewportHeight) {
      const height = readLayoutNumber(event, 'height');
      if (height !== undefined) viewportHeight = height;
    }
  }

  // Records a sticky header's measured y (RN's _headerLayoutYs) so the NEXT sticky header down the
  // list can compute its collision point — without this every header would stick indefinitely
  // instead of being pushed off by the one behind it.
  function recordHeaderY(index: number, event: ISymbioteEvent): void {
    const y = readLayoutNumber(event, 'y');
    if (y === undefined) return;
    // DIAGNOSTIC (2026-08-13, tracking the collision hand-off bug — both sticky headers vanishing
    // permanently at the moment they "meet"): the cross-talk map is the ONLY source of
    // nextHeaderLayoutY for every header ahead of this one; if a later header's onLayout never
    // fires (e.g. windowing drops its cell) this map entry never lands and the collision math
    // upstream falls back to the `?? 0` default (a collisionPoint of `-layoutHeight`), which is
    // almost certainly wrong.
    dlog(`VirtualizedList recordHeaderY index=${index} y=${y}`);
    headerLayoutYs.set(index, y);
    stickyVersion += 1;
  }

  function stickyLayoutFor(index: number): (event: ISymbioteEvent) => void {
    const measure = makeCellMeasure(index);
    return (event: ISymbioteEvent): void => {
      measure(event);
      recordHeaderY(index, event);
    };
  }

  // Only a header that is MOUNTED RIGHT NOW can collide with this one. React derives it the same
  // way — its ScrollView receives `renderedStickyIndices`, not the full section list
  // (adapters/react/.../virtualized-list/index.ts:732) — and that difference was the whole sticky
  // bug on this adapter: `headerLayoutYs` is append-only, so passing the FULL index list kept
  // handing a header the stale y of a next header that had long since scrolled out of the window
  // and unmounted. The header then pinned itself against an obstacle that no longer existed and
  // froze there. Proven by sticky-collision-parity.test.ts, which diffs this exact input against
  // the React reference across a scroll path. The map itself is deliberately NOT pruned (React
  // does not prune either): a measured y stays valid for when that header scrolls back in.
  function nextStickyHeaderYFor(index: number): number | undefined {
    void stickyVersion;
    const indices = narrowed.stickyHeaderIndices;
    if (indices === undefined) return undefined;
    const mounted = new Set(allCells.map(cell => cell.index));
    const rendered = indices.filter(stickyIndex => mounted.has(stickyIndex));
    return nextStickyHeaderY(rendered, rendered.indexOf(index), headerLayoutYs);
  }

  function makeCellMeasure(index: number): (event: ISymbioteEvent) => void {
    return (event: ISymbioteEvent): void => {
      const length = readLayoutLength(event, narrowed.horizontal);
      if (length === undefined) return;
      dlog(`VirtualizedList cell ${index} measured length=${length}`);
      dispatch({ kind: 'measure', index, length });
    };
  }

  // A literal `style={...}` attribute on a symbiote-* intrinsic hits the SAME Svelte
  // special-case as a `style` key inside a spread (renderer.ts's TEMPLATE_KEY_UNMANGLE header
  // comment) — so the leading/gap/trailing spacer views and the per-cell wrapper below route
  // their style through a one-key `toTemplateSafeProps` spread instead of a literal attribute.
  function extentSpacerProps(extent: number): Record<string, unknown> {
    return toTemplateSafeProps({
      style: narrowed.horizontal ? { width: extent } : { height: extent },
    });
  }

  function cellHostProps(index: number): Record<string, unknown> {
    return toTemplateSafeProps({ onLayout: makeCellMeasure(index), style: cellInvertedStyle });
  }

  function mergeSeparator(gapIndex: number, patch: Partial<ISeparatorProps<ItemT>>): void {
    if (!isSeparatorGapInRange(gapIndex, listState.metrics.count)) return;
    separatorOverrides.set(gapIndex, { ...separatorOverrides.get(gapIndex), ...patch });
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
      updateProps: (select: 'leading' | 'trailing', newProps: Record<string, unknown>): void => {
        mergeSeparator(select === 'leading' ? index - 1 : index, newProps);
      },
    };
  }

  // ---- imperative handle: component instance exports, the Svelte twin of Vue's expose() /
  // React's useImperativeHandle. A parent does `<VirtualizedList bind:this={ref} .../>` and calls
  // `ref.scrollToIndex(...)`. Instance exports remain valid in runes mode (only `export let` for
  // props is replaced by $props()). ----
  export function scrollToOffset(params: { offset: number; animated?: boolean }): void {
    dispatch({ kind: 'scroll-to-offset', offset: params.offset, animated: params.animated ?? true });
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
  // update lands (proven by Switch's snap-back $effect + switch.smoke.test.ts), the same
  // after-commit timing Vue's `flush: 'post'` watcher and React's layout effect give the reducer. ----
  $effect(() => {
    void commitSignature;
    const inputs = buildInputs();
    const result = reduceList(listState, { kind: 'commit' }, inputs);
    runEffects(result.effects, inputs);
  });

  // Clear pending timers on unmount (RN ViewabilityHelper.dispose + the fill timer). A bare
  // `$effect` with no reactive reads in its body runs once on mount; its returned cleanup runs on
  // destroy — the Svelte twin of Vue's onBeforeUnmount.
  $effect(() => {
    return () => {
      if (viewableTimer !== null) clearTimeout(viewableTimer);
      if (batchTimer !== null) clearTimeout(batchTimer);
    };
  });

  const scrollViewIntrinsics = $derived(selectScrollIntrinsics(narrowed.horizontal, narrowed.contentContainerStyle));

  const resolvedStyle = $derived(
    narrowed.inverted
      ? [narrowed.style, narrowed.horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE]
      : narrowed.style,
  );
  const resolvedContentContainerStyle = $derived(
    narrowed.horizontal
      ? [scrollViewIntrinsics.contentStyle, { width: metrics.total }]
      : scrollViewIntrinsics.contentStyle,
  );

  // Android wrap mode only: mirrors ScrollView's own index.svelte (same reasoning there) — RN's
  // splitLayoutProps routes LAYOUT props (margin/flex/size/position/...) onto the wrapping
  // AndroidSwipeRefreshLayout, VISUAL props (background/padding/border/...) onto the inner scroll
  // view, instead of leaving the wrapper unstyled (which collapses it to zero height).
  const layoutSplit = $derived(
    shouldWrapRefreshControl
      ? splitLayoutProps([resolveSvelteClass(narrowed.class), resolvedStyle])
      : undefined,
  );

  const outerBag = $derived.by(() => {
    const bag: Record<string, unknown> = {
      style: [scrollViewIntrinsics.scrollViewBaseStyle, layoutSplit !== undefined ? layoutSplit.inner : resolvedStyle],
      horizontal: narrowed.horizontal,
      // RN defaults nested scrolling ON (ScrollView.js `nestedScrollEnabled ?? true`, mirrored by
      // this adapter's own ScrollView.svelte). VirtualizedList hand-rolls the raw scroll intrinsic
      // instead of rendering <ScrollView> (see this file's header comment), so it never inherited
      // that default — on Android, a FlatList/SectionList nested inside a page ScrollView (the
      // canary's own App.svelte shape) never got nested-scroll gesture arbitration and only the
      // outer page scrolled.
      nestedScrollEnabled: true,
      onScroll,
      onLayout: onViewportLayout,
    };
    if (layoutSplit === undefined) bag.class = narrowed.class;
    if (commandedOffset !== undefined) bag.contentOffset = commandedOffset;
    // forwarding.scrollEventThrottle (not the raw prop): folds in the sticky-mode default
    // (1 native / 16 JS-fallback, see resolveScrollForwarding) when the user hasn't set one —
    // without it, a sticky header rebuilt off too-sparse scroll events pins/collides late.
    if (forwarding.scrollEventThrottle !== undefined) bag.scrollEventThrottle = forwarding.scrollEventThrottle;
    if (narrowed.onScrollBeginDrag !== undefined) bag.onScrollBeginDrag = narrowed.onScrollBeginDrag;
    if (narrowed.onScrollEndDrag !== undefined) bag.onScrollEndDrag = narrowed.onScrollEndDrag;
    if (narrowed.onMomentumScrollBegin !== undefined) bag.onMomentumScrollBegin = narrowed.onMomentumScrollBegin;
    if (narrowed.onMomentumScrollEnd !== undefined) bag.onMomentumScrollEnd = narrowed.onMomentumScrollEnd;
    if (narrowed.keyboardShouldPersistTaps !== undefined) {
      bag.keyboardShouldPersistTaps = narrowed.keyboardShouldPersistTaps;
    }
    if (narrowed.keyboardDismissMode !== undefined) bag.keyboardDismissMode = narrowed.keyboardDismissMode;
    if (narrowed.stickyHeaderIndices !== undefined) bag.stickyHeaderIndices = narrowed.stickyHeaderIndices;
    if (narrowed.maintainVisibleContentPosition !== undefined) {
      bag.maintainVisibleContentPosition = narrowed.maintainVisibleContentPosition;
    }
    // The list's accessibility/testID/aria surface rides down onto the raw scroll intrinsic —
    // Object.assign merges a bag already built field-by-field (pickAccessibilityProps), not a raw
    // spread of `props`, because `pickAccessibilityProps` is shared by every list forwarding hop
    // (FlatList/SectionList/VirtualizedSectionList -> VirtualizedList), each of which folds it
    // into its OWN host-attribute bag the same way — a raw spread would forward stray fields
    // (extraData, renderItem, …) those callers never mean to pass down.
    Object.assign(bag, pickAccessibilityProps(props));
    return bag;
  });

  // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment) — renamed before either bag is spread onto its
  // symbiote-* intrinsic below; `setAttributeOp`'s `realPropName()` reverses it right before
  // `routeProp`.
  const templateOuterBag = $derived(toTemplateSafeProps(outerBag));

  // Pull-to-refresh: build the real RefreshControl's own prop bag when onRefresh is set (mirrors
  // React's `scrollProps.refreshControl = createElement(RefreshControl, {...})`); refreshing
  // defaults to false when nullish, same as RN/React.
  const refreshControlProps = $derived.by(() => {
    if (narrowed.onRefresh === undefined) return undefined;
    return {
      refreshing: narrowed.refreshing ?? false,
      onRefresh: narrowed.onRefresh,
      progressViewOffset: narrowed.progressViewOffset,
    };
  });
  // iOS: RefreshControl is a childless sibling before the content container. Android: it WRAPS the
  // whole scroll view (an Android ScrollView accepts only one child) — same PLATFORM.
  // refreshControlMode ScrollView's own index.svelte reads, reused here rather than duplicated.
  const shouldWrapRefreshControl = $derived(
    PLATFORM.refreshControlMode === 'wrap' && refreshControlProps !== undefined,
  );

  const contentBag = $derived({ style: resolvedContentContainerStyle, collapsable: false });
  const templateContentBag = $derived(toTemplateSafeProps(contentBag));

  const stickySet = $derived(
    narrowed.stickyHeaderIndices !== undefined ? new Set(narrowed.stickyHeaderIndices) : undefined,
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
      hasSeparators: props.separator !== undefined,
    });
  });
  // forcedStickyCell prepended to the window cells so BOTH walk through the SAME keyed
  // {#each} — a Svelte {#if}/{#each} split, unlike React/Vue's single flat children array,
  // is two entirely different template positions with no shared component identity, so a
  // header toggling between "forced ahead of the window" and "inside the window" across
  // {#if}/{#each} would get destroyed and recreated on every such toggle (losing its
  // measured layout, landing back at its unmeasured default translateY) — exactly the
  // flicker-then-freeze this whole forcedStickyCell mechanism exists to prevent. One keyed
  // list keeps the SAME component instance across that transition, matching cell.key.
  const allCells = $derived(
    plan?.forcedStickyCell !== undefined && plan !== null
      ? [plan.forcedStickyCell, ...plan.cells]
      : (plan?.cells ?? []),
  );
  const cellInvertedStyle = $derived(
    narrowed.inverted ? (narrowed.horizontal ? INVERTED_X_STYLE : INVERTED_Y_STYLE) : undefined,
  );

  // Reads separatorVersion so a .highlight()/.unhighlight()/.updateProps() call (ISeparators, above)
  // reactively refreshes this exact cell's separator props — a plain per-cell object literal inlined
  // in the template would NOT re-track separatorOverrides (a non-reactive Map) on its own.
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

{#snippet listBody()}<!--
  No whitespace is allowed between the sibling {#if} blocks below (header / body / footer), or
  between the siblings inside the body's each-block (cell / separator), or between the leading
  spacer / each-block / trailing spacer. Svelte only trims LEADING/TRAILING whitespace of a
  fragment; whitespace strictly BETWEEN two sibling non-text nodes collapses to a single-space
  TEXT NODE and is kept (Svelte compiler utils.js clean_nodes, verified against 5.56.8) — which
  would land as a stray RCTRawText child of this scroll content view. A raw-text child of a
  non-Text view is invalid on real Fabric, so this is a correctness fix, not just formatting.
  Caught by virtualized-list.smoke.test.ts asserting an exact windowed child count; keep it exact
  this way if you touch this block.
-->{#if hasHeader}<symbiote-view>{@render props.header?.()}</symbiote-view>{/if}{#if metrics.count === FIRST_INDEX}{#if props.empty}<symbiote-view>{@render props.empty()}</symbiote-view>{/if}{:else if plan}{#if plan.leadingExtent > EMPTY_OFFSET}<symbiote-view
        {...extentSpacerProps(plan.leadingExtent)}
      ></symbiote-view>{/if}{#each allCells as cell (cell.key)}{#if stickySet?.has(cell.index)}<ScrollViewStickyHeader onLayout={stickyLayoutFor(cell.index)} nextHeaderLayoutY={nextStickyHeaderYFor(cell.index)}>{@render props.item({
          item: narrowed.getItem(narrowed.data, cell.index),
          index: cell.index,
          separators: makeSeparators(cell.index),
        })}</ScrollViewStickyHeader>{:else}<symbiote-view {...cellHostProps(cell.index)}>{@render props.item({
          item: narrowed.getItem(narrowed.data, cell.index),
          index: cell.index,
          separators: makeSeparators(cell.index),
        })}</symbiote-view>{/if}{#if plan.forcedStickyCell && cell.index === plan.forcedStickyCell.index && plan.gapExtent > EMPTY_OFFSET}<symbiote-view
        {...extentSpacerProps(plan.gapExtent)}
      ></symbiote-view>{/if}{#if props.separator && cell.index < metrics.last && cell.index !== plan.forcedStickyCell?.index}<symbiote-view>{@render props.separator(separatorPropsFor(cell.index))}</symbiote-view>{/if}{/each}{#if plan.trailingExtent > EMPTY_OFFSET}<symbiote-view
        {...extentSpacerProps(plan.trailingExtent)}
      ></symbiote-view>{/if}{/if}{#if props.footer}<symbiote-view>{@render props.footer()}</symbiote-view>{/if}
{/snippet}

{#snippet scrollBody()}<!--
  Same no-whitespace-between-siblings rule as listBody() above: the optional sibling
  RefreshControl and the content container are two siblings of one parent when RefreshControl is
  NOT wrapping (iOS), so they must sit edge-to-edge with zero characters between them.
-->{#if !shouldWrapRefreshControl && refreshControlProps !== undefined}<RefreshControl {...refreshControlProps} />{/if}{#if narrowed.horizontal}<symbiote-horizontal-scroll-content {...templateContentBag}>{@render listBody()}</symbiote-horizontal-scroll-content>{:else}<symbiote-scroll-content {...templateContentBag}>{@render listBody()}</symbiote-scroll-content>{/if}{/snippet}

{#if shouldWrapRefreshControl && refreshControlProps !== undefined}
  <RefreshControl {...refreshControlProps} style={layoutSplit?.outer}>
    {#if narrowed.horizontal}
      <symbiote-horizontal-scroll-view {...templateOuterBag} {@attach (node) => (hostRef = node)}>{@render scrollBody()}</symbiote-horizontal-scroll-view>
    {:else}
      <symbiote-scroll-view {...templateOuterBag} {@attach (node) => (hostRef = node)}>{@render scrollBody()}</symbiote-scroll-view>
    {/if}
  </RefreshControl>
{:else if narrowed.horizontal}
  <symbiote-horizontal-scroll-view {...templateOuterBag} {@attach (node) => (hostRef = node)}>{@render scrollBody()}</symbiote-horizontal-scroll-view>
{:else}
  <symbiote-scroll-view {...templateOuterBag} {@attach (node) => (hostRef = node)}>{@render scrollBody()}</symbiote-scroll-view>
{/if}
