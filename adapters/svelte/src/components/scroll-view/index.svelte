<script lang="ts" module>
  // ScrollView — CLAUDE.md's own "most feature-heavy component in the codebase" (sticky headers,
  // RefreshControl, the imperative scroll handle, maintainVisibleContentPosition, native
  // scroll-attach). Per core/components/src/index.ts's own comment above the ScrollView exports,
  // there is NO renderScrollView Descriptor factory — no 3-layer split, no descriptorToSvelte
  // bridge (none exists anywhere in this adapter, see the svelte-adapter-dom-shim skill §15's
  // fixed-shape-render note). This component hand-assembles markup and wires refs/effects
  // directly, calling the SAME framework-agnostic helpers React's usePreparedScrollView / Vue's
  // createScrollView call: resolveDecelerationRate, selectScrollIntrinsics, readLayoutDimension,
  // didContentSizeChange, resolveScrollForwarding, buildScrollViewHandle, attachStickyScroll,
  // forwardScrollEvent, resolveAccessibilityProps (all @symbiote-native/components /
  // @symbiote-native/engine).
  //
  // Fabric tree shape: a scroll view wraps a content view holding the children (RN's own
  // ScrollView.js shape). Svelte cannot pick a host tag name dynamically without `<svelte:element>`
  // (untested/unverified under the DOM shim, and not exercised elsewhere in this adapter — see the
  // svelte-adapter-dom-shim skill §4), so the horizontal/vertical tag choice is a static
  // `{#if isHorizontal}` branch instead of a data-driven `createElement(scrollViewIntrinsic, …)`
  // call the way React/Vue do it.
  //
  // RefreshControl attachment (item 3 of the task's priority list): iOS renders the REAL
  // `RefreshControl.svelte` (adapters/svelte/src/components/RefreshControl.svelte, already built —
  // not duplicated here) as a childless SIBLING before the content container. Android WRAPS the
  // scroll view with it (`refreshControl` becomes the parent, scroll view nested inside) —
  // structurally possible in Svelte (unlike React's cloneElement / Vue's VNode re-invocation)
  // because `refreshControl` is typed as RefreshControl's OWN PROPS BAG here (scroll-view-props.ts),
  // not a pre-rendered element/snippet: ScrollView itself instantiates `<RefreshControl>` in the
  // right position and puts the scroll view INSIDE it on Android via plain markup nesting.
  //
  // KNOWN GAPS (all reported honestly — see the task's priority list):
  //  1. `stickyHeaderIndices` / `invertStickyHeaders` are NOT auto-honored (see scroll-view-props.ts
  //     and sticky-header.svelte's header comments for the full reasoning). Compose the exported
  //     `ScrollViewStickyHeader` manually instead; it auto-wires to THIS ScrollView's scroll offset
  //     via Svelte context (scroll-view-sticky-context.ts), so no extra props are usually needed.
  //  2. `maintainVisibleContentPosition` is forwarded to the native node and `collapsableChildren`
  //     is set correctly (via resolveScrollForwarding), but not otherwise exercised or tested here.
  import type { IScrollViewProps } from './scroll-view-props';
  import type { IScrollViewHandle } from '@symbiote-native/components';

  export type { IScrollViewProps, IScrollViewHandle };
</script>

<script lang="ts">
  import { setContext } from 'svelte';
  import {
    attachStickyScroll,
    buildScrollViewHandle,
    didContentSizeChange,
    forwardScrollEvent,
    readLayoutDimension,
    resolveAccessibilityProps,
    resolveDecelerationRate,
    resolveScrollForwarding,
    selectScrollIntrinsics,
    splitLayoutProps,
    type IContentSize,
  } from '@symbiote-native/components';
  import {
    AnimatedValue,
    dlog,
    event as animatedEvent,
    isNativeAnimatedAvailable,
    resolveClassName,
    type ISymbioteEvent,
    type ISymbioteNode,
  } from '@symbiote-native/engine';
  import { resolveSvelteClass } from '../../class-value';
  import { PLATFORM } from './scroll-view-platform';
  import { SCROLL_VIEW_STICKY_CONTEXT_KEY } from './scroll-view-sticky-context';
  import RefreshControl from '../RefreshControl.svelte';
  import type { ShimElement } from '../../dom-shim';
  import { createAttachmentsSync } from '../../runes/attachments';

  let {
    style,
    class: className,
    contentContainerStyle,
    horizontal,
    decelerationRate,
    refreshControl,
    onContentSizeChange,
    stickyHeaderIndices,
    invertStickyHeaders,
    onLayout,
    onScroll,
    scrollEventThrottle,
    children,
    ...passthrough
  }: IScrollViewProps = $props();

  $effect(() => {
    if (stickyHeaderIndices === undefined || stickyHeaderIndices.length === 0) return;
    dlog(
      'ScrollView.stickyHeaderIndices is not auto-honored on Svelte (no index-wrap mechanism — ' +
        'see scroll-view-props.ts KNOWN GAP); compose ScrollViewStickyHeader manually instead',
    );
  });

  // $state.raw, NOT $state: holds the shim element by IDENTITY, same rule Switch's hostShim
  // documents — a deep $state proxy would make dispatchViewCommand miss the engine's WeakMap
  // mirror and every scrollTo/scrollToEnd/flashScrollIndicators would silently no-op.
  let hostShim = $state.raw<ShimElement | null>(null);
  const handle: IScrollViewHandle = buildScrollViewHandle(
    (): ISymbioteNode | null => hostShim?.engineNode ?? null,
  );

  // Plain exported functions on the instance script are what a parent's `bind:this={ref}` sees
  // (svelte-adapter-dom-shim skill §15's Switch precedent) — the Svelte mechanism for exposing an
  // imperative handle, the twin of React's useImperativeHandle / Vue's expose().
  export function scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void {
    handle.scrollTo(options);
  }
  export function scrollToEnd(options?: { animated?: boolean }): void {
    handle.scrollToEnd(options);
  }
  export function flashScrollIndicators(): void {
    handle.flashScrollIndicators();
  }
  export function getScrollNode(): ISymbioteNode | null {
    return handle.getScrollNode();
  }

  const isHorizontal = $derived(horizontal === true);
  const hasStickyHeaders = $derived(stickyHeaderIndices !== undefined && stickyHeaderIndices.length > 0);
  const shouldWrapRefreshControl = $derived(
    PLATFORM.refreshControlMode === 'wrap' && refreshControl !== undefined,
  );

  // Android wrap mode only: RN's ScrollView.js splits the flattened style across the two boxes —
  // LAYOUT props (margin/flex/size/position/...) drive the outer AndroidSwipeRefreshLayout frame,
  // VISUAL props (background/padding/border/...) paint the inner scroll view. Mirrors React's/Vue's
  // index.android.ts (splitLayoutProps), ported here since Svelte handles both platforms in one
  // file. Splitting on the resolved [class, style] pair (not `style` alone): a class-only layout
  // prop (flex/height/gap/...) is invisible to `style` until resolveClassName runs, so splitting on
  // `style` alone would starve the wrapper of its layout style and it would collapse to nothing —
  // e.g. App.svelte's `class="screen"` (flex:1) on the top-level ScrollView, which left the
  // AndroidSwipeRefreshLayout wrapper with no height for its content to grow into.
  const layoutSplit = $derived(
    shouldWrapRefreshControl ? splitLayoutProps([resolveSvelteClass(className), style]) : undefined,
  );

  // A single AnimatedValue tracks the scroll offset (RN's _scrollAnimatedValue), allocated once
  // per instance — held by IDENTITY (never wrapped in $state, the same reactivity rule the shim
  // node follows), shared with any manually-composed ScrollViewStickyHeader via context below.
  const scrollAnimatedValue = new AnimatedValue(0);

  // Inverted sticky headers stick to the BOTTOM, needing the viewport height (RN _handleLayout).
  let viewportHeight = $state<number | undefined>(undefined);

  // Context handoff for a manually-composed ScrollViewStickyHeader (see scroll-view-props.ts's
  // KNOWN GAP note) — getter functions so a header reads the LIVE value, not a snapshot from
  // whenever it first called getContext().
  setContext(SCROLL_VIEW_STICKY_CONTEXT_KEY, {
    scrollAnimatedValue,
    getInverted: (): boolean | undefined => invertStickyHeaders,
    getViewportHeight: (): number | undefined => viewportHeight,
  });

  // Resolved dynamically, exactly like React (adapters/react/.../scroll-view/shared.ts:267).
  // Previously hardcoded `false`: `attachStickyScroll` makes `scrollAnimatedValue` native up front,
  // and once a value is native AnimatedWithChildren stops cascading listeners into its subtree, so
  // the header's interpolation listener never fires (device-confirmed 2026-08-13: attach CONNECTS
  // but no `animated-tick` arrives). That observation was right; the conclusion drawn from it was
  // not. RN carries the SAME gate (AnimatedWithChildren.js:74) and streams values back only for
  // AnimatedValue, never an interpolation — so the listener is silent under RN too, and sticky
  // headers work anyway: the listener never drove the visible pin. The pin IS the native transform;
  // the listener only feeds the debounced committed transform for hit-testing
  // (ScrollViewStickyHeader.js adds it solely `if (isFabric)`). Forcing the JS path to keep it
  // alive gave up the native driver to preserve a hit-testing detail, putting the pin on the JS
  // thread — visible as drift on iOS and outright failure on Android, whose commit debounce is 15ms
  // against iOS's 64ms (render-scroll-sticky.ts).
  const nativeStickyAvailable = $derived(hasStickyHeaders && isNativeAnimatedAvailable());

  // Native sticky-scroll attach (RN attachNativeEvent / _updateAnimatedNodeAttachment) — NOT used
  // for sticky headers (see the comment above); kept for other native-event-attach consumers.
  $effect(() => {
    if (!nativeStickyAvailable) return;
    const node = hostShim?.engineNode;
    if (node === undefined) return;
    return attachStickyScroll(node, scrollAnimatedValue);
  });

  const resolvedContentContainerStyle = $derived(
    typeof contentContainerStyle === 'string'
      ? resolveClassName(contentContainerStyle)
      : contentContainerStyle,
  );

  const intrinsics = $derived(selectScrollIntrinsics(isHorizontal, resolvedContentContainerStyle));

  const forwarding = $derived(
    resolveScrollForwarding({
      hasStickyHeaders,
      nativeStickyAvailable,
      invertStickyHeaders,
      scrollEventThrottle,
      maintainVisibleContentPosition: passthrough.maintainVisibleContentPosition,
      snapToAlignment: passthrough.snapToAlignment,
    }),
  );

  let lastContentSize = $state.raw<IContentSize | null>(null);

  function handleContentLayout(event: ISymbioteEvent): void {
    const width = readLayoutDimension(event, 'width');
    const height = readLayoutDimension(event, 'height');
    if (width === undefined || height === undefined) return;
    if (!didContentSizeChange(lastContentSize, { width, height })) return;
    lastContentSize = { width, height };
    dlog(`ScrollView onContentSizeChange ${width}x${height}`);
    onContentSizeChange?.(width, height);
  }

  function handleScrollLayout(event: ISymbioteEvent): void {
    if (forwarding.capturesViewportHeight) {
      const height = readLayoutDimension(event, 'height');
      if (height !== undefined) viewportHeight = height;
    }
    onLayout?.(event);
  }

  // onScroll: the JS-fallback path wraps the user's handler in Animated.event so the offset drives
  // the AnimatedValue each frame (RN _scrollAnimatedValueAttachment); the native + plain paths
  // forward the user's handler as-is (the native driver attaches the value on the UI thread).
  const resolvedScrollHandler = $derived.by(() => {
    if (forwarding.mode !== 'sticky-js') return onScroll;
    return animatedEvent(
      [{ nativeEvent: { contentOffset: { y: scrollAnimatedValue } } }],
      onScroll === undefined
        ? undefined
        : { listener: (...args: unknown[]) => forwardScrollEvent(onScroll, args) },
    );
  });

  // Not wrapping: the full [base, style] pair stays on the scroll view, unchanged. Wrapping: only
  // the VISUAL half (layoutSplit.inner) paints it — the LAYOUT half moved to the wrapper below.
  const scrollStyle = $derived([
    intrinsics.scrollViewBaseStyle,
    layoutSplit !== undefined ? layoutSplit.inner : style,
  ]);

  const outerBag = $derived.by(() => {
    const forwarded = resolveAccessibilityProps(passthrough);
    return {
      ...forwarded,
      nestedScrollEnabled: passthrough.nestedScrollEnabled ?? true,
      ...(horizontal !== undefined ? { horizontal } : {}),
      ...(decelerationRate !== undefined
        ? { decelerationRate: resolveDecelerationRate(decelerationRate) }
        : {}),
      // layoutSplit already folded className's resolved value into inner/outer above — forwarding
      // the raw class here too would re-apply its LAYOUT half onto the inner scroll view a second
      // time (on top of the wrapper).
      ...(className !== undefined && layoutSplit === undefined ? { class: className } : {}),
      style: scrollStyle,
      onScroll: resolvedScrollHandler,
      onLayout: handleScrollLayout,
      ...(forwarding.scrollEventThrottle !== undefined
        ? { scrollEventThrottle: forwarding.scrollEventThrottle }
        : {}),
    };
  });

  // `collapsable: false` is load-bearing on Android: the content container is a layout-only view
  // Android Fabric would otherwise view-flatten away, hoisting the cells up as direct children of
  // the scroll view (which strictly hosts one child — an addViewAt crash). No-op on iOS.
  const contentBag = $derived.by(() => ({
    style: intrinsics.contentStyle,
    collapsable: false,
    ...(forwarding.collapsableChildren ? { collapsableChildren: false } : {}),
    ...(onContentSizeChange !== undefined ? { onLayout: handleContentLayout } : {}),
  }));
  // See View.svelte's note on `{@attach}`.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, passthrough);
  });
</script>

{#snippet scrollBody()}
  <!-- Packed edge-to-edge against the next block deliberately (svelte-adapter-dom-shim §16):
       whitespace BETWEEN two sibling blocks survives clean_nodes as a single-space text node,
       which here becomes a real RCTRawText child of a scroll view — an invalid Fabric child that
       fails silently. Do not reformat this join. -->
  {#if !shouldWrapRefreshControl && refreshControl !== undefined}
    <RefreshControl {...refreshControl} />
  {/if}{#if isHorizontal}
    <symbiote-horizontal-scroll-content p={contentBag}>{@render children?.()}</symbiote-horizontal-scroll-content>
  {:else}
    <symbiote-scroll-content p={contentBag}>{@render children?.()}</symbiote-scroll-content>
  {/if}
{/snippet}

{#if shouldWrapRefreshControl && refreshControl !== undefined}
  <RefreshControl {...refreshControl} style={layoutSplit?.outer}>
    {#if isHorizontal}
      <symbiote-horizontal-scroll-view p={outerBag} bind:this={hostShim}>{@render scrollBody()}</symbiote-horizontal-scroll-view>
    {:else}
      <symbiote-scroll-view p={outerBag} bind:this={hostShim}>{@render scrollBody()}</symbiote-scroll-view>
    {/if}
  </RefreshControl>
{:else if isHorizontal}
  <symbiote-horizontal-scroll-view p={outerBag} bind:this={hostShim}>{@render scrollBody()}</symbiote-horizontal-scroll-view>
{:else}
  <symbiote-scroll-view p={outerBag} bind:this={hostShim}>{@render scrollBody()}</symbiote-scroll-view>
{/if}
