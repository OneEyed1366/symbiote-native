<script>
  let { cycles = 0, count = 30 } = $props();
  let cycle = $state(0);
  const rows = Array.from({ length: count }, (_, index) => index);
  $effect(() => {
    if (cycle < cycles) setTimeout(() => { cycle += 1; }, 0);
  });
</script>

{#if cycle % 2 === 0}
  <scroll-view>{#each rows as row (row)}<view><text>{row}</text></view>{/each}</scroll-view>
{:else}
  <view>{#each rows as row (row)}<view><text>{row}</text></view>{/each}</view>
{/if}
