<script setup lang="ts">
// The checkbox is itself the touch target, the label beside it is plain text as in expo-checkbox
defineProps<{
  testID: string;
  label: string;
  value: boolean;
  color?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ change: [value: boolean] }>();
</script>

<template>
  <view class="capability-row">
    <checkbox
      :testID="testID"
      :value="value"
      :color="color"
      :disabled="disabled"
      @valueChange="event => emit('change', event.value)"
    />
    <text class="capability-label">{{ label }}</text>
  </view>
</template>
