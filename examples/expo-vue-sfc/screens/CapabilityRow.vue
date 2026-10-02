<script setup lang="ts">
import { CAPABILITY_LABEL } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';

defineProps<{ testID: string; label: string; status: ICapabilityStatus }>();
</script>

<template>
  <view :testID="testID" class="capability-row">
    <text class="capability-label">{{ label }}</text>
    <view :class="`status-badge status-badge-${status}`">
      <text class="status-badge-text">{{ CAPABILITY_LABEL[status] }}</text>
    </view>
  </view>
</template>
