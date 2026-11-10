<!-- Long enough to scroll, which the minimize behavior and the repeated tap both need -->
<script setup lang="ts">
const FEED_ROW_COUNT = 40;
const FEED_ROWS = Array.from({ length: FEED_ROW_COUNT }, (_, index) => index + 1);
</script>

<template>
  <scroll-view testID="native-tabs-feed" class="screen">
    <view class="scroll-content">
      <view v-for="row in FEED_ROWS" :key="row" class="recipe">
        <text class="list-row-text">{{ `Feed item ${row}` }}</text>
      </view>
    </view>
  </scroll-view>
</template>
