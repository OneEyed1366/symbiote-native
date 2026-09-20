<script>
  let { expanded = false } = $props();
</script>

<view testID="container">
  <view testID="always" />
  {#if expanded}
    <view testID="sometimes" />
  {/if}
</view>
