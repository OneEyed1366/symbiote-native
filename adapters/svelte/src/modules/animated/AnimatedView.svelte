<script lang="ts" module>
  // Animated.View: wraps @symbiote-native/engine's Animated value graph around a
  // symbiote-view host tag. Hand-authors its own root tag rather than composing View.svelte —
  // View.svelte exposes no host-node escape hatch (nothing exported), so there is nothing to
  // capture a ref onto; the pattern instead mirrors Pressable/ScrollView, the adapter's existing
  // precedent for a component that needs the raw host node (svelte-adapter-custom-renderer
  // skill). Since View.svelte does no prop transformation of its own (it is a pure pass-through
  // bag), hand-authoring here loses no logic — unlike AnimatedImage, which reuses Image's
  // buildImageBag for exactly that reason.
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
  import { dlog, isNativeAnimatedAvailable, reduceProps, readPassthroughStyle } from '@symbiote-native/engine';
  import { createAnimatedReconcileRuntime } from './animated-props-runtime';
  import { createAttachmentsSync } from '../../runes/attachments';
  import { toTemplateSafeProps } from '../../renderer';
  import type { IHostInstance } from '@symbiote-native/engine';

  let {
    children,
    passthroughAnimatedPropExplicitValues: passthrough,
    ...rest
  }: IAnimatedComponentProps = $props();

  // $state.raw, NOT $state — same identity rule every stateful component in this adapter
  // follows (Switch/Pressable/ScrollView): a deep $state proxy would make the engine's
  // WeakMap-keyed node lookups miss.
  let hostRef = $state.raw<IHostInstance | null>(null);

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
    // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
    // TEMPLATE_KEY_UNMANGLE header comment) — renamed before the spread; `setAttributeOp`'s
    // `realPropName()` reverses it right before `routeProp`.
    return toTemplateSafeProps(out);
  });

  const runtime = createAnimatedReconcileRuntime();

  // DIAGNOSTIC (2026-08-13, tracking the effect_update_depth_exceeded device crash): isolates
  // whether `{@attach}` below EVER re-fires after the initial mount. Nodes are eagerly bound
  // under the custom-renderer API (unlike the retired shim's lazy-until-committed ShimElement),
  // so a re-fire here would mean the host node identity itself changed — worth keeping as a
  // tripwire even though the original suspect (a custom-element `p` prop commit re-triggering
  // the ref callback) no longer exists under per-prop spreading.
  let hostRefChangeCount = 0;
  $effect(() => {
    void hostRef;
    dlog(`AnimatedView hostRef identity change #${++hostRefChangeCount} isNull=${hostRef === null}`);
  });

  // `rest` and `hostRef` are read unconditionally before any branch — the dependency-tracking
  // discipline every $effect in this adapter follows (a guarded read drops that dependency from
  // future re-runs). reconcile() itself handles a null node.
  $effect(() => {
    const currentRest = rest;
    const node = hostRef;
    runtime.reconcile(currentRest, node, wantsNative);
  });

  $effect(() => () => runtime.teardown());

  // See View.svelte's note on `{@attach}`.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostRef, rest);
  });
</script>

<symbiote-view {...reduced} {@attach (node) => (hostRef = node)}>
  {@render children?.()}
</symbiote-view>
