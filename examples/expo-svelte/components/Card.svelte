<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    testID,
    title,
    children,
  }: { testID: string; title: string; children: Snippet } = $props();
</script>

<view {testID} class="feature-card">
  <view class="feature-card-header">
    <text class="feature-card-title">{title}</text>
  </view>
  {@render children()}
</view>
