<script lang="ts">
  import LayoutAnimationConfig from './layout-animation-config.svelte';

  let {
    skipEntering,
    nested = false,
    outside = false,
  }: { skipEntering?: boolean; nested?: boolean; outside?: boolean } =
    $props();

  const fade = () => ({
    animations: {},
    initialValues: {},
    callback: undefined,
  });
</script>

<view>
  <LayoutAnimationConfig {skipEntering}>
    {#if nested}
      <view><view><view p={{ entering: fade }} /></view></view>
    {:else if !outside}
      <view p={{ entering: fade }} />
    {/if}
  </LayoutAnimationConfig>
  {#if outside}
    <view p={{ entering: fade }} />
  {/if}
</view>
