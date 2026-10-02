<script setup lang="ts">
import { CAPABILITY_LABEL } from '../components/capability-status';
import type { ICapabilityStatus } from '../components/capability-status';

defineProps<{ testID: string; label: string; status: ICapabilityStatus }>();
</script>

<template>
  <view :testID="testID" class="auth-capability-row">
    <text class="auth-capability-label">{{ label }}</text>
    <view :class="`auth-status-badge auth-status-badge-${status}`">
      <text class="auth-status-text">{{ CAPABILITY_LABEL[status] }}</text>
    </view>
  </view>
</template>
