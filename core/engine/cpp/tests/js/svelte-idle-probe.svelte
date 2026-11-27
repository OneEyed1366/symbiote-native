<script>
  let { count = 4 } = $props();
  const rows = Array.from({ length: count }, (_, index) => index);
</script>

<safe-area-view>
  <scroll-view>
    <view>
      <text>menu</text>
      {#each rows as row (row)}
        <view onPress={() => row}><text>{row}</text></view>
      {/each}
    </view>
  </scroll-view>
</safe-area-view>
