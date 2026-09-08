<script lang="ts" module>
  // ScrollView: a prop-folding passthrough over the `scroll-view` / `horizontal-scroll-view` tag,
  // the same shape View.svelte and SafeAreaView.svelte already have.
  //
  // EVERYTHING STRUCTURAL MOVED TO THE ENGINE. `registerScrollViewBehavior()` (src/register.ts)
  // gives both tags a `buildStructure` that creates the content node, a `foldPayload` that
  // composes the axis base style under the app's and resolves `decelerationRate` /
  // `nestedScrollEnabled` / `horizontal`, a `slotProps` rename that carries
  // `contentContainerStyle` onto that content node, a claim on `refresh-control` (beside the
  // content view on iOS, wrapping the scroll view on Android), the synthesized
  // `onContentSizeChange`, and the sticky-header machinery. A wrapper that still did any of it
  // would be a SECOND owner — the content node would be nested twice.
  //
  // So this file is left with what only a framework can do: turn a Snippet into children, turn a
  // props bag into a `<RefreshControl>`, and expose the imperative handle a `bind:this` reaches.
  //
  // WHY IT STILL EXISTS AT ALL. Svelte's parser decides component-vs-element by tag CASE, in a
  // module constant with no compile option (symbiote-primitive-tags skill), so `<ScrollView>`
  // cannot be a string. `Animated.ScrollView` also needs a real component to wrap. An app that
  // wants the tag writes `<scroll-view>` directly and gets the identical tree.
  import type { IScrollViewProps } from './scroll-view-props';
  import type { IScrollViewHandle } from '@symbiote-native/components';

  export type { IScrollViewProps, IScrollViewHandle };
</script>

<script lang="ts">
  import {
    buildScrollViewHandle,
    resolveAccessibilityProps,
  } from '@symbiote-native/components';
  import { dlog, type ISymbioteNode } from '@symbiote-native/engine';
  import RefreshControl from '../RefreshControl.svelte';
  import type { ShimElement } from '../../dom-shim';
  import { createAttachmentsSync } from '../../runes/attachments';

  let {
    horizontal,
    refreshControl,
    stickyHeaderIndices,
    children,
    ...passthrough
  }: IScrollViewProps = $props();

  $effect(() => {
    if (stickyHeaderIndices === undefined || stickyHeaderIndices.length === 0)
      return;
    dlog(
      'ScrollView.stickyHeaderIndices is not honored by this adapter — compose the ' +
        '`sticky-header` tag around the sections that should pin (see scroll-view-props.ts)',
    );
  });

  // $state.raw, NOT $state: holds the shim element by IDENTITY — a deep $state proxy would make
  // dispatchViewCommand miss the engine's WeakMap mirror and every
  // scrollTo/scrollToEnd/flashScrollIndicators would silently no-op.
  let hostShim = $state.raw<ShimElement | null>(null);
  const handle: IScrollViewHandle = buildScrollViewHandle(
    (): ISymbioteNode | null => hostShim?.engineNode ?? null,
  );

  // Plain exported functions on the instance script are what a parent's `bind:this={ref}` sees —
  // the Svelte mechanism for exposing an imperative handle, the twin of React's
  // useImperativeHandle / Vue's expose().
  export function scrollTo(options?: {
    x?: number;
    y?: number;
    animated?: boolean;
  }): void {
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

  // `horizontal` picks the TAG and is deliberately not forwarded: the horizontal intrinsic is a
  // different native ViewManager on Android, and on iOS the behavior's own fold writes the prop
  // from the tag it was looked up by. Forwarding `horizontal={false}` onto the vertical tag would
  // add a payload key the tag already answers.
  const isHorizontal = $derived(horizontal === true);

  const bag = $derived(resolveAccessibilityProps(passthrough));

  // See View.svelte's note on `{@attach}`.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, passthrough);
  });
</script>

{#snippet body()}
  <!-- The gap between these two sibling blocks survives clean_nodes as a ' ' text node, but the
       shim drops a whitespace-only node whose parent takes no raw text, so it never reaches
       Fabric (dom-shim/text.ts, svelte-adapter-dom-shim §16b).

       RefreshControl is an ordinary child on BOTH platforms — the behavior claims it and the
       engine places or inverts it. Everything after it lands in the content node. -->
  {#if refreshControl !== undefined}
    <RefreshControl {...refreshControl} />
  {/if}
  {@render children?.()}
{/snippet}

{#if isHorizontal}
  <horizontal-scroll-view p={bag} bind:this={hostShim}>
    {@render body()}
  </horizontal-scroll-view>
{:else}
  <scroll-view p={bag} bind:this={hostShim}>
    {@render body()}
  </scroll-view>
{/if}
