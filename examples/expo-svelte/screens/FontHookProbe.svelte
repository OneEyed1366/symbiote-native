<script lang="ts">
  import { untrack } from 'svelte';
  import { useFonts } from '@symbiote-native/font/svelte';
  import ResultRow from '../components/ResultRow.svelte';

  let { family, uri }: { family: string; uri: string } = $props();

  // The rune loads once per mount, a later change of the map is not reloaded
  const fonts = useFonts(untrack(() => ({ [family]: uri })));
</script>

<ResultRow
  testID="font-hook-result"
  label="useFonts [loaded, error]"
  value={`${fonts.loaded}, ${fonts.error === null ? 'no error' : fonts.error.message}`}
/>
