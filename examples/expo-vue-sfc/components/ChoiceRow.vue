<script setup lang="ts" generic="T extends string | number | boolean | undefined">
import ActionButton from './ActionButton.vue';

defineProps<{
  testID: string;
  label: string;
  options: readonly { label: string; value: T }[];
  value: T;
  onChange: (value: T) => void;
  color: string;
}>();
</script>

<template>
  <view :testID="testID">
    <text class="capability-label">{{ label }}</text>
    <view class="button-row">
      <ActionButton
        v-for="option in options"
        :key="option.label"
        :testID="`${testID}-${option.label}`"
        :title="option.value === value ? `● ${option.label}` : option.label"
        :onPress="() => onChange(option.value)"
        :color="color"
      />
    </view>
  </view>
</template>
