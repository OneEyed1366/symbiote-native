<script lang="ts" module>
  // TouchableWithoutFeedback: built on Pressable, no visual feedback of its own. Ported against
  // RN's own source (.vendors/react-native/.../Components/Touchable/TouchableWithoutFeedback.js)
  // after the 2026-08-19 audit.
  //
  // RN builds a FULL Pressability config here — delayPressIn / delayPressOut /
  // minPressDuration: 0 — so "without feedback" means no VISUAL, not no TIMING. The previous port
  // spread the delay props straight into Pressable, which both ignored them (Pressable owns no
  // press-delay scheduling) and forwarded them to the host as unknown Fabric props. The same
  // shared machine TouchableOpacity runs now runs here with the visual half left empty.
  import type { ITouchableWithoutFeedbackProps } from './touchable-without-feedback-props';

  export type { ITouchableWithoutFeedbackProps };
</script>

<script lang="ts">
  import {
    createTouchableFeedbackHandlers,
    createTouchableFeedbackRuntime,
    TOUCHABLE_MIN_PRESS_DURATION_MS,
  } from '@symbiote-native/components';
  import type { ISymbioteEvent } from '@symbiote-native/engine';
  import Pressable from '../pressable/index.svelte';

  function scheduleTimeout(callback: () => void, ms: number): () => void {
    const id = setTimeout(callback, ms);
    return () => clearTimeout(id);
  }

  let {
    children: content,
    onPressIn,
    onPressOut,
    delayPressIn = 0,
    delayPressOut = 0,
    // RN's Touchables override Pressability's own 130ms floor with 0.
    minPressDuration = TOUCHABLE_MIN_PRESS_DURATION_MS,
    ...rest
  }: ITouchableWithoutFeedbackProps = $props();

  // Setup-scope only, mutated by the machine — never `$state`.
  const runtime = createTouchableFeedbackRuntime();

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
          onPressIn?.(event);
        },
        deactivate(event: ISymbioteEvent): void {
          onPressOut?.(event);
        },
      },
    ),
  );
</script>

<Pressable
  __minPressDuration={0}
  {...rest}
  onPressIn={handlers.handlePressIn}
  onPressOut={handlers.handlePressOut}
>
  {#snippet children()}
    {@render content?.()}
  {/snippet}
</Pressable>
