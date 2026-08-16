<script lang="ts" module>
  // ScrollViewStickyHeader: the Svelte twin of React's/Vue's per-header sticky component
  // (adapters/react/src/components/scroll-view/sticky-header.tsx,
  // adapters/vue/src/components/scroll-view/sticky-header.ts). Drives the shared `reduceSticky`
  // state machine (@symbiote-native/components/state/sticky-header-reducer); this component
  // supplies only Svelte's lifecycle: the folded state cell, the interpolation + listener wiring,
  // the debounce setTimeout, and a reactive re-render trigger.
  //
  // NOT auto-wrapped by `stickyHeaderIndices` on ScrollView (it only ever sees an opaque children
  // Snippet, nothing to index/wrap - see scroll-view-props.ts's KNOWN GAP). App code composes
  // this directly around the section that should stick:
  //
  //   <ScrollView>
  //     <ScrollViewStickyHeader>
  //       <Text>Section A</Text>
  //     </ScrollViewStickyHeader>
  //     <Row />
  //     ...
  //   </ScrollView>
  //
  // (VirtualizedList's own stickyHeaderIndices IS auto-wrapped, since it walks an indexable cell
  // list - see virtualized-list/index.svelte.)
  //
  // `nextHeaderLayoutY` (the collision point where this header gets pushed off by the next sticky
  // header) has no automatic cross-talk wiring for a manually-composed header here (no
  // headerLayoutYs map exists without auto-wrapping). Left undefined, a header sticks
  // indefinitely once pinned - correct for the common single-header case. An app with multiple
  // manually-composed headers can pass it explicitly if it tracks the next header's own y.
  //
  // Native-Animated-driven, like React's ScrollViewStickyHeader.js: the pinned translateY rides
  // as the raw AnimatedInterpolation node in style.transform on a real Animated.View
  // (AnimatedView.svelte), whose `__makeNative()` connects it straight to the native shadow tree,
  // so once native the pin tracks scroll on the UI thread with zero JS per frame - the
  // interpolation's own .addListener() below only drives the separate debounced
  // `passthroughAnimatedPropExplicitValues` (RN's own hit-testing sync).
  //
  // reduceSticky's 'layout' case carries an `alreadyAtThisGeometry` guard (sticky-header-reducer.ts):
  // without it, a redundant onLayout reporting the SAME y/height (which every onLayout consumer
  // must tolerate) rebuilds the interpolation graph and reconnects it natively on every pass, and
  // each such commit can itself provoke another relayout - an unbounded same-tick ping-pong that
  // crashes with Svelte's `effect_update_depth_exceeded`. Fixed at the shared layer so every
  // adapter gets it, not just this one.
  //
  // Bootstrap note: the FIRST tick must reach this component's interpolation via JS (the parent's
  // own scroll-forwarding, NOT `attachStickyScroll`'s native event attach) — `__makeNative()`
  // cascades to its PARENT first (interpolation-node.ts), so once `wantsNative` flips true off
  // the first settled debounce, the whole chain promotes to native automatically. If
  // `scrollAnimatedValue` were made native UP FRONT, its JS listener cascade would be permanently
  // disabled (AnimatedWithChildren.__callListeners skips children once isNative) before a single
  // tick ever reached this component - a bootstrap deadlock, not a flaky native module. This is
  // why ScrollView/VirtualizedList force `nativeStickyAvailable = false`: the correct bootstrap
  // path, not a workaround.
  import type { IStickyHeaderComponentProps } from './sticky-header-props';

  export type { IStickyHeaderComponentProps };

  // Diagnostic-only: a module-scope counter so every instance across every ScrollViewStickyHeader
  // in a device log is individually identifiable (see the mount/unmount dlog calls below).
  let stickyHeaderInstanceSeq = 0;
</script>

<script lang="ts">
  import { getContext } from 'svelte';
  import {
    createInitialStickyState,
    reduceSticky,
    readLayoutNumber,
    STICKY_HEADER_Z_INDEX,
    type IStickyAction,
    type IStickyEffect,
    type IStickyReducerInputs,
  } from '@symbiote-native/components';
  import { AnimatedValue, Platform, dlog, type AnimatedInterpolation, type ISymbioteEvent } from '@symbiote-native/engine';
  import AnimatedView from '../../modules/animated/AnimatedView.svelte';
  import {
    SCROLL_VIEW_STICKY_CONTEXT_KEY,
    type IScrollViewStickyContext,
  } from './scroll-view-sticky-context';
  import { pickAttachmentProps } from '../../runes/attachments';

  let {
    nextHeaderLayoutY,
    onLayout: onLayoutProp,
    scrollAnimatedValue: scrollAnimatedValueProp,
    inverted: invertedProp,
    scrollViewHeight: scrollViewHeightProp,
    children,
    ...passthrough
  }: IStickyHeaderComponentProps = $props();

  // Resolve the scroll wiring from the parent ScrollView's context when not given explicitly.
  // A fresh standalone AnimatedValue is the fallback for a header used outside a ScrollView
  // (never sticks, but never crashes either).
  const stickyContext = getContext<IScrollViewStickyContext | undefined>(SCROLL_VIEW_STICKY_CONTEXT_KEY);
  $effect(() => {
    if (stickyContext === undefined && scrollAnimatedValueProp === undefined) {
      dlog('ScrollViewStickyHeader used outside a ScrollView — sticky positioning is a no-op');
    }
  });
  // svelte-ignore state_referenced_locally -- captured ONCE by identity; it does not change
  // after mount, so re-deriving it would be wrong.
  const scrollAnimatedValue =
    scrollAnimatedValueProp ?? stickyContext?.scrollAnimatedValue ?? new AnimatedValue(0);
  const inverted = $derived(invertedProp ?? stickyContext?.getInverted());
  const scrollViewHeight = $derived(scrollViewHeightProp ?? stickyContext?.getViewportHeight());

  // The one folded state cell (RN's scattered useState/useRef collapsed into IStickyHeaderState),
  // mutated in place by reduceSticky. Named `stickyState`, not `state`: a local binding literally
  // called `state` collides with the `$state` rune (Svelte's store_rune_conflict warning).
  const stickyState = createInitialStickyState();
  // Bumped on every 'apply-passthrough' effect so the passthrough $derived below re-reads
  // stickyState.translateY (RN's forceRender()).
  let version = $state(0);

  // The interpolation node currently bound into style.transform — held by IDENTITY ($state.raw),
  // rebuilt on every 'rebuild-interpolation' effect.
  let animatedTranslateY = $state.raw<AnimatedInterpolation>(
    scrollAnimatedValue.interpolate({ inputRange: [-1, 0], outputRange: [0, 0] }),
  );
  let listenerId: string | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  function inputs(): IStickyReducerInputs {
    return { os: Platform.OS, inverted, scrollViewHeight, nextHeaderLayoutY };
  }

  function runEffects(effects: IStickyEffect[]): void {
    for (const effect of effects) {
      switch (effect.kind) {
        case 'rebuild-interpolation': {
          // Logs the actual input/output ranges (not just `changedKeys=style`) so a device log
          // shows what gets built right at a header collision; own layoutY identifies which
          // header this is.
          dlog(
            `ScrollViewStickyHeader[y=${stickyState.layoutY}] rebuild-interpolation ` +
              `inputRange=${JSON.stringify(effect.inputRange)} outputRange=${JSON.stringify(effect.outputRange)} ` +
              `nextHeaderLayoutY=${String(nextHeaderLayoutY)}`,
          );
          // Detach the old listener, build a fresh interpolation onto the shared scroll value, and
          // wire the settled-value listener (drives ONLY the debounced hit-testing passthrough
          // below — the visible pin rides the native AnimatedProps connection in the markup).
          if (listenerId !== undefined) animatedTranslateY.removeListener(listenerId);
          const next = scrollAnimatedValue.interpolate({
            inputRange: effect.inputRange,
            outputRange: effect.outputRange,
          });
          listenerId = next.addListener(({ value }: { value: number | string }): void => {
            if (typeof value === 'number') dispatch({ kind: 'animated-tick', value });
          });
          animatedTranslateY = next;
          break;
        }
        case 'schedule-debounce':
          if (debounceTimer !== undefined) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            debounceTimer = undefined;
            dispatch({ kind: 'debounce-fired', value: effect.value });
          }, effect.delay);
          break;
        case 'apply-passthrough':
          // The actual committed translateY — a freeze at a huge/wrong number here is the
          // visible-disappearance symptom to watch for.
          dlog(`ScrollViewStickyHeader[y=${stickyState.layoutY}] apply-passthrough translateY=${effect.translateY}`);
          version += 1;
          break;
        case 'record-header-y':
          // No auto-wrap cross-talk map in this adapter (see the module header comment) — nothing
          // to record into.
          break;
      }
    }
  }

  function dispatch(action: IStickyAction): void {
    runEffects(reduceSticky(stickyState, action, inputs()).effects);
  }

  // Rebuild when the collision/viewport inputs change; also does the initial identity build.
  $effect(() => {
    void inverted;
    void scrollViewHeight;
    void nextHeaderLayoutY;
    dispatch({ kind: 'inputs-changed' });
  });

  // Logs mount/unmount so a device log shows whether a header index gets destroyed+recreated (a
  // fresh instance id right after an unmount of the same index) as it crosses the
  // forcedStickyCell/windowed-cell boundary in VirtualizedList's {#each}, or stays one instance.
  const instanceId = ++stickyHeaderInstanceSeq;
  dlog(`ScrollViewStickyHeader#${instanceId} mount`);

  // Detach the listener + clear the debounce on unmount.
  $effect(() => {
    return (): void => {
      dlog(`ScrollViewStickyHeader#${instanceId}[y=${stickyState.layoutY}] unmount`);
      if (listenerId !== undefined) animatedTranslateY.removeListener(listenerId);
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
    };
  });

  function handleLayout(event: ISymbioteEvent): void {
    const y = readLayoutNumber(event, 'y');
    const height = readLayoutNumber(event, 'height');
    // Keep the previous value when a field is absent (RN sets state only on a defined read).
    dispatch({
      kind: 'layout',
      y: y ?? stickyState.layoutY,
      height: height ?? stickyState.layoutHeight,
    });
    dlog(`ScrollViewStickyHeader layout y=${y} height=${height}`);
    onLayoutProp?.(event);
  }

  // The EXPLICIT debounced translateY overrides the committed transform for hit-testing, while
  // `animatedTranslateY` (in the markup below) does the smooth native-driven pin — per RN
  // ScrollViewStickyHeader.js, and AnimatedView.svelte's own passthroughAnimatedPropExplicitValues
  // contract (readPassthroughStyle).
  const passthroughAnimatedPropExplicitValues = $derived.by(() => {
    void version;
    return stickyState.translateY !== null
      ? { style: { transform: [{ translateY: stickyState.translateY }] } }
      : null;
  });

  // Kept as ITS OWN derived, reading only `animatedTranslateY` — NOT folded into `bag` below.
  // `bag` also carries `passthroughAnimatedPropExplicitValues`, which changes value on every
  // 'apply-passthrough' tick (every scroll frame); if `style` lived in that same derived it would
  // get a fresh object identity on every tick even though the interpolation node never changed.
  // animated-props-runtime.ts's reconcile() relies on `style`'s reference staying stable across
  // passthrough-only ticks to skip rebuilding the native AnimatedProps graph — without this
  // split, every scroll frame tore down and reconnected the native node, and a reconnect right as
  // scrolling stopped left the header frozen at its post-reset default until the next tick.
  const animatedStyle = $derived.by(() => ({
    transform: [{ translateY: animatedTranslateY }],
    zIndex: STICKY_HEADER_Z_INDEX,
  }));

  // collapsable:false keeps the wrapper a real Yoga node; zIndex makes the pinned header paint
  // OVER the rows scrolling under it.
  const bag = $derived.by(() => ({
    style: animatedStyle,
    onLayout: handleLayout,
    collapsable: false,
    passthroughAnimatedPropExplicitValues,
  }));

  // `{@attach}` rides in the rest object as a symbol-keyed entry; forwarded onto AnimatedView,
  // which owns this component's actual host node.
  const attachments = $derived(pickAttachmentProps(passthrough));
</script>

<AnimatedView {...bag} {...attachments}>
  {@render children?.()}
</AnimatedView>
