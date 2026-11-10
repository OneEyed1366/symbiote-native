<!-- A row of pills for an option with a few fixed values, the chosen one is filled -->
<script setup lang="ts" generic="T extends string">
defineProps<{
  testID: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  color: string;
}>();

const SELECTED_TEXT_COLOR = '#0b1622';
</script>

<template>
  <view :testID="testID" class="choice-row">
    <pressable
      v-for="option in options"
      :key="option"
      :testID="`${testID}-${option}`"
      class="choice-chip"
      :style="{
        borderColor: color,
        backgroundColor: option === value ? color : 'transparent',
      }"
      @press="onChange(option)"
    >
      <text
        class="choice-chip-text"
        :style="{ color: option === value ? SELECTED_TEXT_COLOR : color }"
      >
        {{ option }}
      </text>
    </pressable>
  </view>
</template>
