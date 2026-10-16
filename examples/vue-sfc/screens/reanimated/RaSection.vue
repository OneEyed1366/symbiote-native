<script setup lang="ts">
// One titled block of the Reanimated screen
defineProps<{ title: string; note?: string }>();
</script>

<template>
  <view class="ra-section">
    <text class="ra-section-title">{{ title }}</text>
    <text v-if="note !== undefined" class="ra-note">{{ note }}</text>
    <slot />
  </view>
</template>
