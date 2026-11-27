<script>
  import { useStackNavigation } from '@symbiote-native/navigation/svelte/runes';
  import { home } from './svelte-stack-handle';

  home.navigation = useStackNavigation();
  const rows = Array.from({ length: 30 }, (_, index) => index);
</script>

<view>{#each rows as row (row)}<view><text>{row}</text></view>{/each}</view>
