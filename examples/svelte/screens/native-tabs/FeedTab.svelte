<script lang="ts">
  const FEED_ROW_COUNT = 40;
  const FEED_ROWS = Array.from(
    { length: FEED_ROW_COUNT },
    (_, index) => index + 1,
  );
</script>

<!-- Long enough to scroll, which the minimize behavior and the repeated tap both need -->
<scroll-view testID="native-tabs-feed" class="screen">
  <view class="scroll-content">
    {#each FEED_ROWS as row (row)}
      <view class="recipe">
        <text class="list-row-text">{`Feed item ${row}`}</text>
      </view>
    {/each}
  </view>
</scroll-view>
