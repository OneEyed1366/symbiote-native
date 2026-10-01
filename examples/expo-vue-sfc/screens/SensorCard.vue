<script setup lang="ts">
import { SENSOR_STATUS, SENSOR_STATUS_TEXT } from './sensor-status';
import type { ISensorStatus } from './sensor-status';

defineProps<{ testID: string; title: string; status: ISensorStatus }>();
</script>

<template>
  <view :testID="testID" class="sensor-card">
    <view class="sensor-card-header">
      <text class="sensor-card-title">{{ title }}</text>
      <view :class="`sensor-status-badge sensor-status-badge-${status}`">
        <text class="sensor-status-text">{{ SENSOR_STATUS_TEXT[status] }}</text>
      </view>
    </view>
    <text v-if="status === SENSOR_STATUS.checking" class="info-text">checking availability…</text>
    <text v-else-if="status === SENSOR_STATUS.unavailable" class="info-text">
      not available on this device
    </text>
    <text v-else-if="status === SENSOR_STATUS.waiting" class="info-text">
      waiting for first reading…
    </text>
    <slot v-else />
  </view>
</template>
