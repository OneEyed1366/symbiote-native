<!-- A caption over a row of pills, for panels that hold several choices -->
<script setup lang="ts" generic="T extends string">
import ChoiceRow from './ChoiceRow.vue';

defineProps<{
  testID: string;
  label: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  color: string;
}>();
</script>

<template>
  <text class="switch-label">{{ label }}</text>
  <ChoiceRow
    :testID="testID"
    :value="value"
    :options="options"
    :onChange="onChange"
    :color="color"
  />
</template>
