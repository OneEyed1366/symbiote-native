<script lang="ts">
  import type { Snippet } from 'svelte';

  // One user task: what it is for, what to do on the device, what must be seen afterwards
  let {
    testID,
    title,
    why,
    steps,
    expect,
    children,
  }: {
    testID: string;
    title: string;
    why: string;
    steps: readonly string[];
    expect: string;
    children?: Snippet;
  } = $props();
</script>

<view {testID} class="scenario-card">
  <text class="scenario-title">{title}</text>
  <text class="scenario-why">{why}</text>
  <view class="scenario-steps">
    {#each steps as step, index (step)}
      <text class="scenario-step">{`${index + 1}. ${step}`}</text>
    {/each}
  </view>
  {@render children?.()}
  <view class="scenario-expect">
    <text class="scenario-expect-label">Expected</text>
    <text class="scenario-expect-text">{expect}</text>
  </view>
</view>
