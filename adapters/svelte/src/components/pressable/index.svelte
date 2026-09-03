<script lang="ts" module>
  // Pressable: the Svelte lifecycle half. The press lifecycle (the long-press timer,
  // unstable_pressDelay deferral, the pressRetentionOffset drift test, the suppression flags)
  // lives in @symbiote-native/components/state as a pure machine over a runtime + host; the
  // render decisions (the responder listeners, the disabled->accessibilityState fold, the
  // ripple prop) in @symbiote-native/components/view, shared verbatim with React and Vue. Here
  // runes supply the reactivity: `$state` holds `pressed`, a plain setup-scope object (created
  // once, like Vue's) holds the press runtime, and `$state.raw` holds the responder's ShimElement
  // by IDENTITY so the machine can measure through it (same shallowRef-not-ref concern as Vue's
  // pressable.ts / Switch's own hostShim — a deep-proxied `$state` object would miss the engine's
  // WeakMap mirror lookup).
  //
  // Pressable owns no `renderPressable()` Descriptor factory (unlike Switch's fixed-shape
  // `renderSwitch()`) — core/components/src/view/render-pressable only resolves the responder-
  // listener bag and the accessibilityState fold, so this hand-authors the host node directly,
  // close to View.svelte's own shape, wiring the press responder listeners onto it instead of
  // importing View.svelte (which has no `bind:this` escape hatch for the raw ShimElement the
  // measure handle needs).
  import type { IPressableProps } from './pressable-props';

  export type { IPressableProps };
</script>

<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    createPressHandlers,
    createPressRuntime,
    disposePressRuntime,
    rippleProps,
    buildPressableListeners,
    resolveDisabledAccessibilityState,
    resolveAccessibilityProps,
    noteHoverNoop,
    DEFAULT_DELAY_LONG_PRESS_MS,
    DEFAULT_MIN_PRESS_DURATION_MS,
    type IPressHost,
    type IPressState,
  } from '@symbiote-native/components';
  import { measure, type ISymbioteNode } from '@symbiote-native/engine';
  import type { ShimElement } from '../../dom-shim';
  import { createAttachmentsSync } from '../../runes/attachments';

  let {
    onPress,
    onPressIn,
    onPressOut,
    onPressMove,
    onLongPress,
    delayLongPress = DEFAULT_DELAY_LONG_PRESS_MS,
    disabled,
    cancelable,
    hitSlop,
    pressRetentionOffset,
    unstable_pressDelay = 0,
    __minPressDuration = DEFAULT_MIN_PRESS_DURATION_MS,
    android_ripple,
    android_disableSound,
    onHoverIn,
    onHoverOut,
    delayHoverIn,
    delayHoverOut,
    accessibilityState,
    style,
    class: className,
    children,
    ...rest
  }: IPressableProps & {
    /** @internal Touchable* mirrors RN's Pressability minPressDuration: 0 override. */
    __minPressDuration?: number;
  } = $props();

  let pressed = $state(false);
  // Plain setup-scope object, never `$state`: mutated by the machine on every event, never
  // reactively read — same as Vue's setup-scope runtime.
  const runtime = createPressRuntime();
  // `$state.raw`, NOT `$state`: holds the responder ShimElement by IDENTITY. `$state()` would
  // deep-proxy it, and `measure()` looks the RAW node up in the engine's WeakMap mirror — a Proxy
  // wrapper misses that lookup and the retention-region measure silently no-ops.
  let hostShim = $state.raw<ShimElement | null>(null);

  const host: IPressHost = {
    setPressed(next: boolean): void {
      pressed = next;
    },
    getMeasureFn: () => {
      const node: ISymbioteNode | undefined = hostShim?.engineNode;
      if (node === undefined) return undefined;
      return callback => measure(node, callback);
    },
    schedule: (callback, ms) => {
      const id = setTimeout(callback, ms);
      return () => clearTimeout(id);
    },
    now: Date.now,
  };

  onDestroy(() => {
    disposePressRuntime(runtime);
  });

  $effect(() => {
    noteHoverNoop(onHoverIn, onHoverOut);
  });
  void delayHoverIn;
  void delayHoverOut;

  const state: IPressState = $derived({ pressed });

  // Rebuilt whenever the config it closes over changes (mirrors Vue's per-render rebuild); the
  // runtime persists across rebuilds so in-flight timers/drift state survive.
  const handlers = $derived(
    createPressHandlers(
      {
        onPress,
        onPressIn,
        onPressOut,
        onPressMove,
        onLongPress,
        delayLongPress,
        unstable_pressDelay,
        minPressDuration: __minPressDuration,
        hitSlop,
        pressRetentionOffset,
      },
      runtime,
      host,
    ),
  );

  // android_ripple rides a dedicated inner View; on iOS rippleProps() returns undefined, so the
  // child renders unwrapped, no extra node — mirrors React's Pressable + touchable-native-feedback.
  const ripple = $derived(
    android_ripple !== undefined ? rippleProps(android_ripple) : undefined,
  );

  // ONE derived, not four. The accessibility fold and the style resolution used to be their own
  // `$derived`s, each read by exactly this bag and by nothing else — a memo nobody can reuse, in
  // exchange for a reaction-graph node per Pressable instance. A 1 000-row list mounts 2 000 of
  // them, which made this component the largest single allocation site in a create profile.
  // `handlers` and `ripple` stay separate BECAUSE they are read elsewhere: `handlers` must keep
  // its identity across an unrelated bag change or every recompute re-registers native listeners,
  // and `ripple` is read twice (the branch test and the inner view's own bag).
  const bag = $derived.by(() => {
    // Folds aria-*/role into accessibility* — Pressable owns its host node directly (it does not
    // compose View.svelte), so it must fold this itself, exactly like Vue's Pressable and every
    // other Svelte component that hand-authors a raw host tag (RefreshControl.svelte, modal/
    // index.svelte).
    const resolved = resolveAccessibilityProps({
      ...rest,
      accessibilityState: resolveDisabledAccessibilityState(
        accessibilityState,
        disabled,
      ),
    });
    const next: Record<string, unknown> = {
      ...resolved,
      style: typeof style === 'function' ? style(state) : style,
      class: className,
      hitSlop,
      ...buildPressableListeners(handlers, { disabled, cancelable }),
    };
    // Assigned rather than conditionally spread: `...(cond ? { x } : {})` allocated an empty
    // object literal on every evaluation for the overwhelmingly common `undefined` case.
    if (android_disableSound !== undefined)
      next.android_disableSound = android_disableSound;
    return next;
  });

  // See View.svelte's note on `{@attach}`.
  const syncAttachments = createAttachmentsSync();
  $effect(() => {
    syncAttachments(hostShim, rest);
  });
</script>

<symbiote-view p={bag} bind:this={hostShim}>
  {#if ripple !== undefined}
    <symbiote-view p={ripple}>
      {@render children?.(state)}
    </symbiote-view>
  {:else}
    {@render children?.(state)}
  {/if}
</symbiote-view>
