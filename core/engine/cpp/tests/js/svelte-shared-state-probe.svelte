<script module>
  export const shared = $state({ step: 0 });
</script>

<script>
  let { cycles = 0, count = 30 } = $props();
  let cycle = $state(0);
  const rows = Array.from({ length: count }, (_, index) => index);
  const label = $derived('screen ' + shared.step + ' ' + cycle);
  $effect(() => {
    if (cycle < cycles) setTimeout(() => { cycle += 1; }, 0);
  });
</script>

{#if cycle % 2 === 0}
  <scroll-view p={{ testID: label }}>{#each rows as row (row)}<view><text>{row + shared.step}</text></view>{/each}</scroll-view>
{:else}
  <view p={{ testID: label }}>{#each rows as row (row)}<view><text>{row + shared.step}</text></view>{/each}</view>
{/if}
