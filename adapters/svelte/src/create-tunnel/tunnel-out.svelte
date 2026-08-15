<script lang="ts">
  // Renders everything currently tunneled in, in registration order. Mount this in the
  // component that should actually paint the content. `tunnel.items` is a SvelteMap
  // (svelte/reactivity) — iterating it here inside the template is a tracked read, so this
  // re-renders whenever TunnelIn adds/updates/removes an entry, on whichever surface THIS
  // component happens to be mounted on.
  import type { ITunnel } from './tunnel';

  let { tunnel }: { tunnel: ITunnel } = $props();
</script>

{#each tunnel.items as [id, snippet] (id)}
  {@render snippet()}
{/each}
