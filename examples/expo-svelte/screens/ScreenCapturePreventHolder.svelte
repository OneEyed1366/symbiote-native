<script lang="ts">
  import { untrack } from 'svelte';
  import { usePreventScreenCapture } from '@symbiote-native/screen-capture/svelte';

  let { keyName }: { keyName: string } = $props();

  // The rune takes a plain string and applies it once at mount
  usePreventScreenCapture(untrack(() => keyName));
</script>
