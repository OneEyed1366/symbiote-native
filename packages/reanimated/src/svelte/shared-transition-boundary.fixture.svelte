<script lang="ts">
  import SharedTransitionBoundary from './shared-transition-boundary.svelte';

  let { isActive = true, withChild = false }: {
    isActive?: boolean;
    withChild?: boolean;
  } = $props();
</script>

<SharedTransitionBoundary {isActive}>
  {#if withChild}
    <view p={{ testID: 'inside' }} />
  {/if}
</SharedTransitionBoundary>
