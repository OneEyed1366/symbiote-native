<script lang="ts" module>
  // ScrollViewStickyHeader: the Svelte twin of React's/Vue's per-header sticky component
  // (adapters/react/src/components/scroll-view/sticky-header.tsx,
  // adapters/vue/src/components/scroll-view/sticky-header.ts). Drives the SAME framework-agnostic
  // state machine (`reduceSticky` from @symbiote-native/components/state/sticky-header-reducer) —
  // the "one pure state machine every sticky-header consumer drives" per that module's own barrel
  // comment. This component supplies only the Svelte lifecycle: the one folded state cell, the
  // interpolation + listener wiring, the debounce setTimeout, and a reactive re-render trigger.
  //
  // NOT auto-wrapped by `stickyHeaderIndices` on ScrollView — see scroll-view-props.ts's KNOWN GAP
  // note (ScrollView only ever sees an opaque children Snippet, nothing to index/wrap). App code
  // composes this directly around the section that should stick:
  //
  //   <ScrollView>
  //     <ScrollViewStickyHeader>
  //       <Text>Section A</Text>
  //     </ScrollViewStickyHeader>
  //     <Row />
  //     ...
  //   </ScrollView>
  //
  // (VirtualizedList's own stickyHeaderIndices IS auto-wrapped — it walks an indexable cell list,
  // unlike ScrollView; see virtualized-list/index.svelte's sticky wiring.)
  //
  // `nextHeaderLayoutY` (the collision point where this header gets pushed off by the NEXT sticky
  // header) has no automatic cross-talk wiring for a MANUALLY-composed header in this adapter
  // (React/Vue compute it from the index-wrap's headerLayoutYs map, which does not exist here
  // without auto-wrapping). Left undefined by default, a header sticks indefinitely once pinned —
  // the correct, safe behavior for the common single-sticky-header case. An app with multiple
  // manually-composed sticky headers can still pass `nextHeaderLayoutY` explicitly if it tracks the
  // next header's own y.
  //
  // Native-Animated-driven, exactly like React's ScrollViewStickyHeader.js: the pinned translateY
  // rides as the RAW AnimatedInterpolation node in style.transform on a real `Animated.View`
  // (AnimatedView.svelte). AnimatedView's own `AnimatedProps.__makeNative()` connects that node
  // straight to the native shadow tree (connectAnimatedNodeToView), so once native the pin tracks
  // scroll on the UI thread with zero JS per frame — the interpolation's own .addListener() below
  // only drives the SEPARATE debounced `passthroughAnimatedPropExplicitValues` (RN's own
  // hit-testing sync). A first attempt at this rewrite (2026-08-13) crashed on-device with
  // Svelte's `effect_update_depth_exceeded`; the ACTUAL root cause (verified against a headless
  // repro, see core/engine/src/animated/animated-props-reconcile-repro.test.ts and
  // adapters/svelte/src/components/scroll-view/sticky-header-native-driven-repro.test.ts) was NOT
  // the AnimatedProps/AnimatedStyle graph itself (its detach cascade is correctly bounded — the
  // repro proves it stays flat over 20 reconciles). It was `reduceSticky`'s 'layout' case
  // (sticky-header-reducer.ts) unconditionally emitting 'rebuild-interpolation' on EVERY onLayout,
  // even one reporting the SAME y/height as already measured. React's port gets away with this for
  // free — `setLayoutY(sameValue)` is a no-op re-render in React — but the shared reducer had no
  // such guard, so a real device's redundant relayout passes (which every onLayout consumer must
  // tolerate) kept rebuilding the interpolation graph and reconnecting it natively, and each such
  // commit could itself provoke another relayout: an unbounded same-tick ping-pong. Fixed at the
  // shared layer (reduceSticky's `alreadyAtThisGeometry` guard) so every adapter gets it, not just
  // this one.
  //
  // Bootstrap note: the FIRST tick must reach this component's interpolation via JS (the parent
  // ScrollView/VirtualizedList's own scroll-forwarding, NOT `attachStickyScroll`'s native event
  // attach) — `AnimatedInterpolation.__makeNative()` cascades to its PARENT first
  // (interpolation-node.ts), so once `wantsNative` flips true off the first settled debounce, the
  // whole chain (including the shared scrollAnimatedValue) promotes to native automatically. If
  // `scrollAnimatedValue` were made native UP FRONT (attachStickyScroll), its JS listener cascade
  // would be permanently disabled (AnimatedWithChildren.__callListeners skips children once
  // isNative) before a single tick ever reached this component — a deadlock, not a flaky native
  // module. This is why ScrollView/VirtualizedList force `nativeStickyAvailable = false`: it is
  // the correct bootstrap path, not a workaround.
  import type { IStickyHeaderComponentProps } from './sticky-header-props';

  export type { IStickyHeaderComponentProps };

  // Diagnostic-only (see the mount/unmount dlog calls below): a module-scope counter so every
  // instance across every ScrollViewStickyHeader in a device log is individually identifiable,
  // the same pattern animated-props-runtime.ts's globalReconcileSeq uses.
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

  // Resolve the scroll wiring from the parent ScrollView's context when not given explicitly —
  // the Svelte substitute for React's/Vue's automatic index-wrap injection (see
  // scroll-view-props.ts's KNOWN GAP note). A fresh standalone AnimatedValue is the fallback for
  // a header used outside a ScrollView (never sticks, but never crashes either — same defensive
  // shape Vue's own sticky-header.ts falls back to).
  const stickyContext = getContext<IScrollViewStickyContext | undefined>(SCROLL_VIEW_STICKY_CONTEXT_KEY);
  $effect(() => {
    if (stickyContext === undefined && scrollAnimatedValueProp === undefined) {
      dlog('ScrollViewStickyHeader used outside a ScrollView — sticky positioning is a no-op');
    }
  });
  // svelte-ignore state_referenced_locally -- intentional: captured ONCE by identity, mirroring
  // React's stable useRef / Vue's setup-scope markRaw const for the same value (both explicitly
  // read scrollAnimatedValue once and never re-derive it — it does not change after mount).
  const scrollAnimatedValue =
    scrollAnimatedValueProp ?? stickyContext?.scrollAnimatedValue ?? new AnimatedValue(0);
  const inverted = $derived(invertedProp ?? stickyContext?.getInverted());
  const scrollViewHeight = $derived(scrollViewHeightProp ?? stickyContext?.getViewportHeight());

  // The one folded state cell (RN's scattered useState/useRef collapsed into IStickyHeaderState),
  // mutated in place by reduceSticky — same shape as React's stateRef/Vue's setup-scope `state`.
  // Named `stickyState`, not `state`: a local binding literally called `state` collides with the
  // `$state` rune (Svelte's store_rune_conflict warning — `$state` would parse as a subscription
  // to a store named `state`).
  const stickyState = createInitialStickyState();
  // Bumped on every 'apply-passthrough' effect so the passthrough $derived below re-reads
  // stickyState.translateY (RN's forceRender()).
  let version = $state(0);

  // The interpolation node currently bound into style.transform — held by IDENTITY ($state.raw,
  // same rule every ref-like value in this adapter follows), rebuilt on every 'rebuild-
  // interpolation' effect (React's own useState<AnimatedInterpolation>).
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
          // DIAGNOSTIC (2026-08-13, tracking the collision hand-off bug: both headers vanish and
          // never reappear once they "meet"): the previous instrumentation round logged only
          // `changedKeys=style`, never the actual numbers — this is the missing piece to see what
          // ranges get built right at the collision (own layoutY identifies WHICH header this is).
          dlog(
            `ScrollViewStickyHeader[y=${stickyState.layoutY}] rebuild-interpolation ` +
              `inputRange=${JSON.stringify(effect.inputRange)} outputRange=${JSON.stringify(effect.outputRange)} ` +
              `nextHeaderLayoutY=${String(nextHeaderLayoutY)}`,
          );
          // Detach the old listener, build a fresh interpolation onto the shared scroll value, and
          // wire the settled-value listener (this drives ONLY the debounced hit-testing passthrough
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
          // DIAGNOSTIC (2026-08-13, same investigation): the actual committed translateY — if this
          // freezes at a huge/wrong number right at collision, that is the visible-disappearance cause.
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

  // DIAGNOSTIC (2026-08-13, tracking a possible instance-identity bug across the
  // forcedStickyCell/windowed-cell boundary in VirtualizedList's {#each}): logs this
  // component's own mount and unmount so a device log shows whether a given header index
  // gets destroyed+recreated (a fresh instance id right after an unmount of the same index)
  // as it transitions between force-mounted and in-window, or genuinely stays one instance.
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
  // `bag` also carries `passthroughAnimatedPropExplicitValues`, which legitimately changes value
  // on every 'apply-passthrough' tick (every scroll frame); if `style` lived inside that same
  // derived, it would get a brand-new object identity on every such tick even though the
  // native-driven interpolation node inside it never changed. animated-props-runtime.ts's
  // reconcile() relies on `style`'s reference staying stable across passthrough-only ticks to
  // skip rebuilding the native AnimatedProps graph — without this split, every scroll frame
  // tore down and reconnected the native node (restoreDefaultValues + a fresh native tag), and a
  // reconnect right as scrolling stopped left the header frozen at its post-reset default until
  // scrolling resumed and the next tick corrected it. That was the collision-disappearance bug.
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
