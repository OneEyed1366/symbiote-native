<script lang="ts" module>
  // Pressable: the Svelte lifecycle half. The press lifecycle (the long-press timer,
  // unstable_pressDelay deferral, the pressRetentionOffset drift test, the suppression flags)
  // lives in @symbiote-native/components/state as a pure machine over a runtime + host; the
  // render decisions (the responder listeners, the disabled->accessibilityState fold, the
  // ripple prop) in @symbiote-native/components/view, shared verbatim with React and Vue. Here
  // runes supply the reactivity: `$state` holds `pressed`, a plain setup-scope object (created
  // once, like Vue's) holds the press runtime, and `$state.raw` holds the responder's host node
  // by IDENTITY so the machine can measure through it (same shallowRef-not-ref concern as Vue's
  // pressable.ts / Switch's own hostRef — a deep-proxied `$state` object would miss the engine's
  // WeakMap mirror lookup).
  //
  // Pressable owns no `renderPressable()` Descriptor factory (unlike Switch's fixed-shape
  // `renderSwitch()`) — core/components/src/view/render-pressable only resolves the responder-
  // listener bag and the accessibilityState fold, so this hand-authors the host node directly,
  // close to View.svelte's own shape, wiring the press responder listeners onto it instead of
  // importing View.svelte (which has no `{@attach}` escape hatch for the raw host node the
  // measure handle needs).
  import type { IPressableProps } from './pressable-props';

  export type { IPressableProps };
</script>

<script lang="ts">
  import {
    createPressHandlers,
    createPressRuntime,
    rippleProps,
    buildPressableListeners,
    resolveDisabledAccessibilityState,
    resolveAccessibilityProps,
    noteHoverNoop,
    DEFAULT_DELAY_LONG_PRESS_MS,
    type IPressHost,
    type IPressState,
  } from '@symbiote-native/components';
  import { measure, type IHostInstance } from '@symbiote-native/engine';
  import { toTemplateSafeProps } from '../../renderer';

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
  }: IPressableProps = $props();

  let pressed = $state(false);
  // Plain setup-scope object, never `$state`: mutated by the machine on every event, never
  // reactively read — same as Vue's setup-scope runtime.
  const runtime = createPressRuntime();
  // `$state.raw`, NOT `$state`: holds the responder host node by IDENTITY. `$state()` would
  // deep-proxy it, and `measure()` looks the RAW node up in the engine's WeakMap mirror — a Proxy
  // wrapper misses that lookup and the retention-region measure silently no-ops.
  let hostRef = $state.raw<IHostInstance | null>(null);

  const host: IPressHost = {
    setPressed(next: boolean): void {
      pressed = next;
    },
    getMeasureFn: () => {
      if (hostRef === null) return undefined;
      const node = hostRef;
      return callback => measure(node, callback);
    },
    schedule: (callback, ms) => {
      const id = setTimeout(callback, ms);
      return () => clearTimeout(id);
    },
  };

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
        hitSlop,
        pressRetentionOffset,
      },
      runtime,
      host,
    ),
  );

  const resolvedAccessibilityState = $derived(
    resolveDisabledAccessibilityState(accessibilityState, disabled),
  );

  // Folds aria-*/role into accessibility* — Pressable owns its host node directly (it does not
  // compose View.svelte), so it must fold this itself, exactly like Vue's Pressable and every
  // other Svelte component that hand-authors a raw host tag (RefreshControl.svelte, modal/
  // index.svelte).
  const resolved = $derived(
    resolveAccessibilityProps({ ...rest, accessibilityState: resolvedAccessibilityState }),
  );

  const resolvedStyle = $derived(typeof style === 'function' ? style(state) : style);

  // android_ripple rides a dedicated inner View; on iOS rippleProps() returns undefined, so the
  // child renders unwrapped, no extra node — mirrors React's Pressable + touchable-native-feedback.
  const ripple = $derived(android_ripple !== undefined ? rippleProps(android_ripple) : undefined);

  const bag = $derived({
    ...resolved,
    style: resolvedStyle,
    class: className,
    hitSlop,
    ...(android_disableSound !== undefined ? { android_disableSound } : {}),
    ...buildPressableListeners(handlers, { disabled, cancelable }),
  });

  // `style` collides with Svelte's own special-cased attribute name (renderer.ts's
  // TEMPLATE_KEY_UNMANGLE header comment) — renamed before the spread; `setAttributeOp`'s
  // `realPropName()` reverses it right before `routeProp`.
  const templateBag = $derived(toTemplateSafeProps(bag));
</script>

<symbiote-view {...templateBag} {@attach (node) => (hostRef = node)}>
  {#if ripple !== undefined}
    <symbiote-view {...ripple}>
      {@render children?.(state)}
    </symbiote-view>
  {:else}
    {@render children?.(state)}
  {/if}
</symbiote-view>
