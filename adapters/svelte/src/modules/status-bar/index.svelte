<script lang="ts">
  // Svelte half of StatusBar, the props stack, statics and Android bar-height constant live in
  // @symbiote-native/engine. It renders no Fabric view, applies its props to one stack entry from
  // an `$effect` and releases the entry when the component is destroyed
  import {
    createStatusBarEntry,
    type IStatusBarProps,
  } from '@symbiote-native/engine';

  let props: IStatusBarProps = $props();

  const entry = createStatusBarEntry();

  // Reads every field of `props`, so any prop change replaces the entry
  $effect(() => {
    entry.apply(props);
  });

  // Popping restores what the stack held below this entry
  $effect(() => () => entry.release());
</script>
