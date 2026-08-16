<script lang="ts" module>
  // TouchableWithoutFeedback: built on Pressable, no visual feedback of its own — just the press
  // wiring, exactly like React's and Vue's twins.
  import type { ITouchableWithoutFeedbackProps } from './touchable-without-feedback-props';

  export type { ITouchableWithoutFeedbackProps };
</script>

<script lang="ts">
  import Pressable from '../pressable/index.svelte';

  let { children: content, ...rest }: ITouchableWithoutFeedbackProps = $props();
</script>

<Pressable {...rest}>
  {#snippet children()}
    {@render content?.()}
  {/snippet}
</Pressable>
