<script lang="ts">
  import type { Snippet } from 'svelte';

  // One titled block of the Reanimated screen
  let {
    title,
    note,
    children,
  }: { title: string; note?: string; children: Snippet } = $props();
</script>

<view class="ra-section">
  <text class="ra-section-title">{title}</text>
  {#if note !== undefined}
    <text class="ra-note">{note}</text>
  {/if}
  {@render children()}
</view>
