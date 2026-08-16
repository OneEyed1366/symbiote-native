<script lang="ts" module>
  // TouchableNativeFeedback: Android's ripple/state-drawable touchable, built on Pressable like
  // the rest of the family. The native ripple props (nativeBackgroundAndroid /
  // nativeForegroundAndroid) ride a dedicated feedback View nested under the Pressable; on iOS
  // they are inert. The static factories + background mapping are shared in
  // @symbiote-native/components/view — this component only attaches them onto the component
  // value (see this folder's index.ts, which Object.assigns them — a `.svelte` file's own
  // `<script module>` cannot reassign or wrap its own compiled default export) and nests the
  // feedback View.
  import type { ITouchableNativeFeedbackProps } from './touchable-native-feedback-props';

  export type { ITouchableNativeFeedbackProps };
</script>

<script lang="ts">
  import { backgroundProps, selectableBackground } from '@symbiote-native/components';
  import { dlog } from '@symbiote-native/engine';
  import Pressable from '../pressable/index.svelte';

  let {
    background,
    useForeground = false,
    children: content,
    ...rest
  }: ITouchableNativeFeedbackProps = $props();

  // RN defaults a missing background to SelectableBackground() so the touchable always shows
  // feedback; mirror that here.
  const resolved = $derived(background ?? selectableBackground());

  $effect(() => {
    dlog(`TouchableNativeFeedback render ${resolved.type} useForeground ${useForeground}`);
  });

  const nativeProps = $derived(backgroundProps(resolved, useForeground));
</script>

<Pressable {...rest}>
  {#snippet children()}
    <symbiote-view {...nativeProps}>
      {@render content?.()}
    </symbiote-view>
  {/snippet}
</Pressable>
