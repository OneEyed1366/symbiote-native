<script lang="ts" module>
  // Animated.ScrollView — unlike View/Text/Image, ScrollView.svelte already exposes an
  // imperative handle (scrollTo/scrollToEnd/flashScrollIndicators/getScrollNode, the SAME
  // IScrollViewHandle shape createAnimatedComponent's resolveHostNode expects on Vue/React) via
  // its own top-level `export function`s. That is exactly what `bind:this` needs, so this
  // component WRAPS the real ScrollView.svelte directly rather than hand-authoring a reduced
  // host tag — the only way to keep ScrollView's full feature surface (sticky headers,
  // RefreshControl, maintainVisibleContentPosition, native scroll-attach) per
  // <adapters_reach_full_feature_parity>; a hand-authored duplicate would silently lose all of
  // it. getScrollNode() IS this adapter's resolveHostNode() equivalent for a scroll container.
  import type { IAnimatedComponentProps } from './animated-component-props';

  export type { IAnimatedComponentProps };
</script>

<script lang="ts">
  import {
    createAnimatedLeafLifecycle,
    isNativeAnimatedAvailable,
    reduceProps,
    readPassthroughStyle,
  } from '@symbiote-native/engine';
  import type { ISymbioteNode } from '@symbiote-native/engine';
  import type { IScrollViewHandle } from '@symbiote-native/components';
  import ScrollView from '../../components/scroll-view/index.svelte';
  import type { IScrollViewProps } from '../../components/scroll-view/scroll-view-props';
  import { pickAttachmentProps } from '../../runes/attachments';

  let {
    children,
    passthroughAnimatedPropExplicitValues: passthrough,
    ...rest
  }: IAnimatedComponentProps = $props();

  // The wrapped ScrollView's own instance — its exported functions ARE its public handle
  // (svelte-adapter-custom-renderer skill's ScrollView precedent), captured by IDENTITY via bind:this,
  // never $state (a deep proxy would still work here since it's just function references, but
  // $state.raw stays consistent with every other imperative-handle capture in this adapter).
  let scrollRef = $state.raw<IScrollViewHandle | null>(null);

  const wantsNative = $derived(passthrough != null && isNativeAnimatedAvailable());

  // reduceProps returns Record<string, unknown> — every field is `unknown` even though it is,
  // at runtime, exactly IScrollViewProps' shape. Bridged back without an `as` cast via the same
  // Object.assign(Object.create(null), …) pattern AnimatedImage.svelte uses (and React's
  // create-animated-component.tsx already establishes): Object.create(null) types as `any`, so
  // the assignment result does too, and TS allows binding `any` into a typed variable.
  const reduced = $derived.by(() => {
    const resolved = reduceProps(rest);
    const passthroughStyle = readPassthroughStyle(passthrough);
    if (passthroughStyle !== undefined) {
      resolved.style =
        resolved.style === undefined ? passthroughStyle : [resolved.style, passthroughStyle];
    }
    const props: IScrollViewProps = Object.assign(Object.create(null), resolved);
    return props;
  });

  const runtime = createAnimatedLeafLifecycle('AnimatedScrollView');

  $effect(() => {
    const currentRest = rest;
    const node: ISymbioteNode | null = scrollRef?.getScrollNode() ?? null;
    runtime.reconcile(currentRest, node, wantsNative);
  });

  $effect(() => () => runtime.teardown());

  // Forward the imperative handle: a parent's `bind:this` on <Animated.ScrollView> gets the
  // same scrollTo/scrollToEnd/flashScrollIndicators/getScrollNode surface plain ScrollView
  // exposes — the Svelte twin of Vue's delegating Proxy `expose()`.
  export function scrollTo(options?: { x?: number; y?: number; animated?: boolean }): void {
    scrollRef?.scrollTo(options);
  }
  export function scrollToEnd(options?: { animated?: boolean }): void {
    scrollRef?.scrollToEnd(options);
  }
  export function flashScrollIndicators(): void {
    scrollRef?.flashScrollIndicators();
  }
  export function getScrollNode(): ISymbioteNode | null {
    return scrollRef?.getScrollNode() ?? null;
  }

  // `reduceProps` rebuilds a plain string-keyed Record, so `{@attach}`'s symbol keys do not
  // survive it — forward them explicitly onto the wrapped ScrollView, which owns the host node.
  const attachments = $derived(pickAttachmentProps(rest));
</script>

<ScrollView {...reduced} {...attachments} bind:this={scrollRef}>
  {@render children?.()}
</ScrollView>
