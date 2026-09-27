<script>
  import { flip } from 'svelte/animate';
  import { registerSetFlipItems } from './svelte-flip-reorder-bridge';

  let items = $state(['a', 'b', 'c', 'd']);

  registerSetFlipItems(next => {
    items = [...next];
  });
</script>

<!-- `<svelte:element>` wraps a dynamic tag the same way navigation chrome does
     (packages/navigation/src/svelte/stack/stack-screen.svelte), the structural trigger
     for the animation_effect_override bug -->
<svelte:element this="view" style={{ flex: 1 }}>
  {#each items as tile (tile)}
    <view testID={tile} animate:flip={{ duration: 260 }} />
  {/each}
</svelte:element>
