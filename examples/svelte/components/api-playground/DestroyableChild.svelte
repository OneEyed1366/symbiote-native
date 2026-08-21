<script lang="ts" module>
  import { onDestroy, onMount } from 'svelte';
  import { Text } from '@symbiote-native/svelte';
  import { dlog } from '@symbiote-native/engine';
</script>

<script lang="ts">
  // onMount / onDestroy demo target (Lifecycle · Yes) — LifecycleDemo.svelte mounts/unmounts this
  // via {#if}, since onDestroy only fires on a real unmount, not on a value changing in place.
  let { onGone }: { onGone: () => void } = $props();

  onMount(() => {
    dlog('api-playground: DestroyableChild mounted');
  });

  onDestroy(() => {
    onGone();
  });
</script>

<Text class="info-text" testID="lifecycle-child">
  DestroyableChild is mounted.
</Text>
