<script setup lang="ts">
defineProps<{
  testID: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
}>();
</script>

<template>
  <view>
    <text class="capability-label">{{ label }}</text>
    <text-input
      :testID="testID"
      :value="value"
      :placeholder="placeholder"
      placeholderTextColor="#41506a"
      autoCapitalize="none"
      :multiline="multiline"
      class="text-input"
      @valueChange="event => onChange(event.text)"
    />
  </view>
</template>
