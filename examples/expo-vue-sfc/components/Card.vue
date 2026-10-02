<script setup lang="ts">
defineProps<{ testID: string; title: string }>();
</script>

<template>
  <view :testID="testID" class="feature-card">
    <view class="feature-card-header">
      <text class="feature-card-title">{{ title }}</text>
    </view>
    <slot />
  </view>
</template>
