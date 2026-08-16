<script lang="ts" module>
  // TouchableOpacity: built on Pressable, like the rest of the family. RN realizes its feedback
  // with Animated (an opacity fade to activeOpacity on press-in, back to 1 on press-out); the
  // press-timing constants and the deactivation-floor math are shared with every adapter
  // (@symbiote-native/components/state/touchable). No `Animated.View` binding exists yet for
  // this adapter — core/engine/src/animated is the framework-agnostic value-graph plumbing, but
  // React and Vue each wrote their OWN reactive binding on top of it
  // (adapters/react/src/modules/animated, adapters/vue/src/modules/animated); porting that
  // binding to Svelte runes is separate, standalone work, out of scope for this Pressable/
  // Touchable/Button pass. `tweenOpacity` below is a deliberate, documented stand-in: it
  // reproduces Animated.timing's quad-inOut curve over the SAME shared duration constants
  // directly onto the style bag via `$state`, using `setTimeout` (not `requestAnimationFrame`,
  // which this adapter must never patch globally per the dom-shim skill §6c, and which a bare
  // headless test sandbox does not provide) so TouchableOpacity still visibly fades. It is not
  // wired into the native Animated node graph — `useNativeDriver`-style native-thread driving is
  // NOT available here until a real Animated adapter binding lands.
  import type { ITouchableOpacityProps } from './touchable-opacity-props';

  export type { ITouchableOpacityProps };
</script>

<script lang="ts">
  import {
    createTouchableFeedbackHandlers,
    createTouchableFeedbackRuntime,
    DEFAULT_ACTIVE_OPACITY,
    DEFAULT_MIN_PRESS_DURATION_MS,
    OPACITY_ACTIVE_DURATION_MS,
    OPACITY_INACTIVE_DURATION_MS,
    RESTING_OPACITY,
  } from '@symbiote-native/components';
  import type { ISymbioteEvent } from '@symbiote-native/engine';
  import Pressable from '../pressable/index.svelte';

  const TWEEN_FRAME_MS = 16;

  // See the module header above: the interim substitute for a real Animated.View driver.
  function tweenOpacity(
    from: number,
    to: number,
    durationMs: number,
    onFrame: (value: number) => void,
  ): () => void {
    const start = Date.now();
    let cancelled = false;
    function step(): void {
      if (cancelled) return;
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      onFrame(from + (to - from) * eased);
      if (t < 1) setTimeout(step, TWEEN_FRAME_MS);
    }
    step();
    return () => {
      cancelled = true;
    };
  }

  function scheduleTimeout(callback: () => void, ms: number): () => void {
    const id = setTimeout(callback, ms);
    return () => clearTimeout(id);
  }

  let {
    activeOpacity = DEFAULT_ACTIVE_OPACITY,
    style,
    class: className,
    children: content,
    onPressIn,
    onPressOut,
    delayPressIn = 0,
    delayPressOut = 0,
    minPressDuration = DEFAULT_MIN_PRESS_DURATION_MS,
    ...rest
  }: ITouchableOpacityProps = $props();

  let opacity = $state(RESTING_OPACITY);
  let cancelTween: (() => void) | undefined;
  // Setup-scope only, mutated by the machine — same as Pressable's own runtime, never `$state`.
  const runtime = createTouchableFeedbackRuntime();

  function setOpacityTo(toValue: number, duration: number): void {
    cancelTween?.();
    const from = opacity;
    cancelTween = tweenOpacity(from, toValue, duration, value => {
      opacity = value;
    });
  }

  // Rebuilt whenever the timing config changes (mirrors Vue's per-render rebuild); the runtime
  // persists across rebuilds so an in-flight delayPressIn timer / activation clock survives.
  const handlers = $derived(
    createTouchableFeedbackHandlers(
      {
        delayPressIn,
        delayPressOut,
        minPressDuration,
        schedule: scheduleTimeout,
        now: Date.now,
      },
      runtime,
      {
        activate(event: ISymbioteEvent): void {
          setOpacityTo(activeOpacity, OPACITY_ACTIVE_DURATION_MS);
          onPressIn?.(event);
        },
        deactivate(event: ISymbioteEvent): void {
          setOpacityTo(RESTING_OPACITY, OPACITY_INACTIVE_DURATION_MS);
          onPressOut?.(event);
        },
      },
    ),
  );

  const foldedStyle = $derived([style, { opacity }]);
</script>

<Pressable {...rest} onPressIn={handlers.handlePressIn} onPressOut={handlers.handlePressOut}>
  {#snippet children()}
    <symbiote-view p={{ style: foldedStyle, class: className }}>
      {@render content?.()}
    </symbiote-view>
  {/snippet}
</Pressable>
