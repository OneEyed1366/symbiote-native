<script lang="ts" module>
  // TouchableHighlight: built on Pressable. Ported against RN's own source
  // (.vendors/react-native/.../Components/Touchable/TouchableHighlight.js) after the 2026-08-19
  // audit; Solid migrated first, then React, Vue and Angular, and this is Svelte.
  //
  // RN drives the underlay from THREE Pressability callbacks, not from a `pressed` flag, and the
  // difference is visible: onPress re-shows the underlay and holds it for delayPressOut, so a tap
  // too fast to see still flashes. The previous port derived the highlight from Pressable's
  // `pressed` through `highlightPressedStyle`, which cannot express that hold — the flag is
  // already false by then. The machine itself
  // (createHighlightUnderlayHandlers) is shared; Svelte owns the reactive `shown` cell and the
  // real timers.
  import type { ITouchableHighlightProps } from './touchable-highlight-props';

  export type { ITouchableHighlightProps };
</script>

<script lang="ts">
  import {
    createHighlightUnderlayHandlers,
    createHighlightUnderlayRuntime,
    hasTouchablePressHandler,
    resolveHighlightExtraStyles,
  } from '@symbiote-native/components';
  import type {
    ISymbioteEvent,
    IStyleProp,
    IViewStyle,
  } from '@symbiote-native/engine';
  import Pressable from '../pressable/index.svelte';

  function scheduleTimeout(callback: () => void, ms: number): () => void {
    const id = setTimeout(callback, ms);
    return () => clearTimeout(id);
  }

  // onPress/onPressIn/onPressOut are INTERCEPTED, not forwarded: RN drives the underlay from
  // those three and then calls the caller's. delayPressOut is CONSUMED (it is the underlay hold),
  // so it must not also reach the host as an unknown Fabric prop. onLongPress deliberately stays
  // in `rest` — Pressable fires it directly — and is only READ here, for the has-handler gate.
  let {
    activeOpacity,
    underlayColor,
    style,
    delayPressOut = 0,
    onPress,
    onPressIn,
    onPressOut,
    onShowUnderlay,
    onHideUnderlay,
    children: content,
    ...rest
  }: ITouchableHighlightProps = $props();

  // `shown` is NOT `pressed`: RN holds the underlay past the tap for delayPressOut.
  let shown = $state(false);
  // Setup-scope only, mutated by the machine on every event and never read reactively — same as
  // Pressable's own runtime, never `$state`.
  const runtime = createHighlightUnderlayRuntime();

  // RN's _hasPressHandler gate: a TouchableHighlight with no press callback is decorative, and
  // flashing an underlay under a touch passing through it is wrong.
  const hasPressHandler = $derived(
    hasTouchablePressHandler({
      onPress,
      onPressIn,
      onPressOut,
      onLongPress: rest.onLongPress,
    }),
  );

  // Rebuilt whenever the config changes; the runtime persists across rebuilds so an in-flight
  // hide timer survives one.
  const underlay = $derived(
    createHighlightUnderlayHandlers(
      { delayPressOut, hasPressHandler, schedule: scheduleTimeout },
      runtime,
      {
        setShown(next: boolean): void {
          shown = next;
        },
        onShowUnderlay: () => onShowUnderlay?.(),
        onHideUnderlay: () => onHideUnderlay?.(),
      },
    ),
  );

  const extra = $derived(
    resolveHighlightExtraStyles({
      shown,
      hasPressHandler,
      underlayColor,
      activeOpacity,
    }),
  );

  // ITEM 7 IS DELIBERATELY NOT FIXED HERE, and this is the whole of the divergence from RN. RN
  // clones its single child with `extra.child`, so the lowered opacity lands on the CHILD while
  // the container keeps an opaque underlay; React does that with cloneElement and Vue with
  // cloneVNode. Svelte hands a component an opaque `Snippet` — a function that renders into an
  // anchor. It cannot be introspected, cloned, or given a prop, and it may have several roots, so
  // there is NO way to reach the child short of a permanent wrapper View. That wrapper would sit
  // in the flex chain between this container and the children and silently re-parent any `flex`
  // they declare; the fake Fabric runs no Yoga, so no headless test can measure the damage.
  // Shipping an unmeasurable layout change is worse than the visual approximation, so both styles
  // stay on the container (the child style folded in LAST), exactly as Solid and Angular decided.
  // resolveHighlightExtraStyles keeps them separate regardless, so a future fix — which needs a
  // real device, not a test — is unblocked.
  const containerStyle = $derived<IStyleProp<IViewStyle>>(
    extra === undefined ? style : [style, extra.underlay, extra.child],
  );

  // Visual first, then the caller's callback — RN's order in _createPressabilityConfig.
  function handlePressIn(event: ISymbioteEvent): void {
    underlay.handlePressIn(event);
    onPressIn?.(event);
  }
  function handlePress(event: ISymbioteEvent): void {
    underlay.handlePress(event);
    onPress?.(event);
  }
  function handlePressOut(event: ISymbioteEvent): void {
    underlay.handlePressOut(event);
    onPressOut?.(event);
  }
</script>

<Pressable
  {...rest}
  style={containerStyle}
  onPress={handlePress}
  onPressIn={handlePressIn}
  onPressOut={handlePressOut}
>
  {#snippet children()}
    {@render content?.()}
  {/snippet}
</Pressable>
