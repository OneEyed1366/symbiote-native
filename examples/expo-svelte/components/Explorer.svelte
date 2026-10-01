<script lang="ts">
  import type { Snippet } from 'svelte';
  import ActionButton from './ActionButton.svelte';

  // Every remaining API call of the package, collapsed so the scenarios above stay the main story
  let {
    testID,
    color,
    children,
  }: { testID: string; color: string; children: Snippet } = $props();

  let isOpen = $state(false);
</script>

<view {testID} class="explorer">
  <ActionButton
    testID={`${testID}-toggle`}
    title={isOpen ? 'Hide API explorer' : 'Open API explorer: every call and option'}
    onPress={() => {
      isOpen = !isOpen;
    }}
    {color}
  />
  {#if isOpen}
    {@render children()}
  {/if}
</view>
