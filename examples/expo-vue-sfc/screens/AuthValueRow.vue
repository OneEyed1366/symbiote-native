<script setup lang="ts">
defineProps<{ label: string; value: string }>();
</script>

<template>
  <view class="auth-capability-row">
    <text class="auth-capability-label">{{ label }}</text>
    <text class="auth-value-text">{{ value }}</text>
  </view>
</template>
