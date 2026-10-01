<script lang="ts">
  import { useVisibility } from '@symbiote-native/navigation-bar/svelte';
  import ResultRow from '../components/ResultRow.svelte';

  const visibility = useVisibility();
</script>

<ResultRow
  testID="navigation-bar-hook"
  label="useVisibility"
  value={visibility.current ?? 'loading…'}
/>
