<script lang="ts" module>
  // Animated.View: wraps @symbiote-native/engine's Animated value graph around a
  // symbiote-view host tag. Hand-authors its own root tag rather than composing View.svelte —
  // View.svelte exposes no host-node escape hatch (no bind:this on its own root, nothing
  // exported), so there is nothing to capture a ref onto; the pattern instead mirrors
  // Pressable/ScrollView, the adapter's existing precedent for a component that needs the raw
  // ShimElement (svelte-adapter-dom-shim skill). Since View.svelte does no prop transformation
  // of its own (it is a pure pass-through bag), hand-authoring here loses no logic — unlike
  // AnimatedImage, which reuses Image's buildImageBag for exactly that reason.
  //
  // The reactive plumbing (leaf lifecycle, native-driver opt-in, native event attach) is shared
  // with AnimatedText/AnimatedImage/AnimatedScrollView via animated-props-runtime.ts — see this
  // module's index.ts for why that is a shared HELPER rather than one generic
  // createAnimatedComponent(Component) the way Vue/React have: Svelte has no h()/createElement
  // to parametrize an arbitrary base component at runtime.
  import type { IAnimatedComponentProps } from './animated-component-props';

  export type { IAnimatedComponentProps };
</script>

<script lang="ts">
  import {
    createAnimatedLeafLifecycle,
    dlog,
    isNativeAnimatedAvailable,
    reduceProps,
    readPassthroughStyle,
  } from '@symbiote-native/engine';
  import { createAttachmentsSync } from '../../runes/attachments';
  import type { ShimElement } from '../../dom-shim';

  let {
    children,
    passthroughAnimatedPropExplicitValues: passthrough,
    ...rest
  }: IAnimatedComponentProps = $props();

  // $state.raw, NOT $state — same identity rule every stateful component in this adapter
  // follows (Switch/Pressable/ScrollView): a deep $state proxy would make the engine's
  // WeakMap-keyed node lookups miss.
  let hostShim = $state.raw<ShimElement | null>(null);

  const wantsNative = $derived(passthrough != null && isNativeAnimatedAvailable());

  // Reduced (rasterized) props for the declarative bag: every animated node replaced by its
  // current value, so the first paint (and every non-animated re-render) carries concrete
  // values — the per-FRAME path is separate (the runtime's reconcile below), driven straight
  // off the raw `rest` object, never through this derivation.
  let reducedCallCount = 0;
  const reduced = $derived.by(() => {
    const out = reduceProps(rest);
    const passthroughStyle = readPassthroughStyle(passthrough);
    if (passthroughStyle !== undefined) {
      out.style = out.style === undefined ? passthroughStyle : [out.style, passthroughStyle];
    }
    dlog(`AnimatedView reduced#${++reducedCallCount} wantsNative=${wantsNative}`);
    return out;
  });

  const runtime = createAnimatedLeafLifecycle('AnimatedView');

  // DIAGNOSTIC (2026-08-13, tracking the effect_update_depth_exceeded device crash): isolates
  // whether `bind:this={hostShim}` below EVER re-fires after the initial mount. If it does — a
  // custom-element `p` prop commit re-triggering the ref callback — that reassignment would make
  // THIS effect's `hostShim?.engineNode` read see a "new" dependency and re-run, independent of
  // whatever else changed, which is a plausible source of a same-flush synchronous loop that has
  // no equivalent in React (ref callbacks)/Vue (template refs)/Angular (ViewChild). Reads ONLY
  // hostShim, deliberately excluding `rest`, so it is unambiguous which one retriggered it.
  let hostShimChangeCount = 0;
  $effect(() => {
    void hostShim;
    dlog(`AnimatedView hostShim identity change #${++hostShimChangeCount} isNull=${hostShim === null}`);
  });

  // `rest` and `hostShim` are read unconditionally before any branch — the dependency-tracking
  // discipline every $effect in this adapter follows (a guarded read drops that dependency from
  // future re-runs; svelte-adapter-dom-shim skill). reconcile() itself handles a null node.
  $effect(() => {
    const currentRest = rest;
    const node = hostShim?.engineNode ?? null;
    runtime.reconcile(currentRest, node, wantsNative);
  });

  $effect(() => () => runtime.teardown());

  // See View.svelte's note on `{@attach}`.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, rest);
  });
</script>

<symbiote-view p={reduced} bind:this={hostShim}>
  {@render children?.()}
</symbiote-view>
