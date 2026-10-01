<script setup lang="ts">
defineProps<{ testID: string; label: string; value: string }>();
</script>

<template>
  <view class="capability-row">
    <text class="capability-label">
      {{ label }}
    </text>

    <text
      :testID="testID"
      class="value-text"
    >
      {{ value }}
    </text>
  </view>
</template>
