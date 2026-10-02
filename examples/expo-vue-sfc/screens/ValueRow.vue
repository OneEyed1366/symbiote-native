<script setup lang="ts">
defineProps<{ label: string; value: string }>();
</script>

<template>
  <view class="capability-row">
    <text class="capability-label">{{ label }}</text>
    <text class="value-text">{{ value }}</text>
  </view>
</template>
