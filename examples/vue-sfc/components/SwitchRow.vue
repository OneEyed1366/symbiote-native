<!-- Label on the left, native switch on the right, tinted by the caller's line colour -->
<script setup lang="ts">
import { TRACK_OFF } from '../screens/canary-shared';

defineProps<{
  testID: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color: string;
}>();
</script>

<template>
  <view class="switch-row">
    <text class="switch-row-label">{{ label }}</text>
    <switch
      :testID="testID"
      :value="value"
      :trackColor="{ false: TRACK_OFF, true: color }"
      @value-change="event => onChange(event.value)"
    />
  </view>
</template>
