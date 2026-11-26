<script>
  let { cycles = 0, count = 1, shared } = $props();
  let cycle = $state(0);
  const rows = Array.from({ length: count }, (_, index) => index);
  $effect(() => {
    if (cycle < cycles) setTimeout(() => { cycle += 1; }, 0);
  });
</script>

{#if cycle % 2 === 0}
  <view style={{ opacity: shared }}>{#each rows as row (row)}<view><text>{row}</text></view>{/each}</view>
{:else}
  <view style={{ opacity: shared }}>{#each rows as row (row)}<view><text>{row}</text></view>{/each}</view>
{/if}
