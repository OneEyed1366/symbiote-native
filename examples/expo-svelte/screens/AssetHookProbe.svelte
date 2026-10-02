<script lang="ts">
  import { useAssets } from '@symbiote-native/asset/svelte';
  import ResultRow from '../components/ResultRow.svelte';

  const BUNDLED_MODULE = require('../assets/bootsplash-logo.svg');

  const loaded = useAssets(BUNDLED_MODULE);
</script>

<ResultRow
  testID="asset-hook-result"
  label="useAssets [assets, error]"
  value={loaded.error === undefined
    ? `${loaded.assets?.length ?? 0} loaded, downloaded ${String(loaded.assets?.[0]?.downloaded)}`
    : loaded.error.message}
/>
