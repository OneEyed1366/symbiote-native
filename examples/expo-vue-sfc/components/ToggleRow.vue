<script setup lang="ts">
defineProps<{
  testID: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  color: string;
}>();
</script>

<template>
  <view class="capability-row">
    <text class="capability-label">{{ label }}</text>
    <switch
      :testID="testID"
      :value="value"
      :trackColor="{ true: color }"
      @valueChange="event => onChange(event.value)"
    />
  </view>
</template>
