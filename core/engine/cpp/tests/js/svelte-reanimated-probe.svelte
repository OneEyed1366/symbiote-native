<script>
  import { probe } from './svelte-reanimated-handle';
  import Live from './svelte-reanimated-live-probe.svelte';
  import Row from './svelte-reanimated-row-probe.svelte';

  let isShown = $state(false);
  const rows = Array.from({ length: 10 }, (_, index) => index);
  probe.show = next => (isShown = next);
</script>

<view>
  {#if isShown}
    <Live />
    {#each rows as row (row)}<Row {row} />{/each}
  {/if}
</view>
