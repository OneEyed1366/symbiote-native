<!--
  One benchmark list row — kept deliberately plain (id, label, remove) so what is measured is the
  engine's commit path and not a decorative row's own layout cost. Vue SFC twin of the
  BenchmarkRow inside .examples/react/screens/BenchmarkScreen.tsx.

  This expands to exactly NINE native views, and that count is load-bearing: it is what turns a
  row count into a view count on the screen's own readout, and a port that produces 8 or 10 puts
  every number ~11% off the other canaries. View 1 · Text+RawText x3 = 6 · Pressable→View x2 = 2.

  `onSelect` / `onRemove` are plain callback PROPS rather than Vue emits, the same choice
  ActionButton.vue makes: the parent hands down ONE stable function identity for the whole list,
  so an untouched row's props compare equal and Vue skips re-rendering it. An `@select` emit would
  need an inline handler per row, which cannot be hoisted out of a v-for scope — every row would
  then re-render on every operation and the measurement would be of that, not of the engine.
-->
<script setup lang="ts">
import { Pressable, Text, View } from '@symbiote-native/vue';

type IBenchmarkRow = {
  id: number;
  label: string;
};

const props = defineProps<{
  row: IBenchmarkRow;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}>();
</script>

<template>
  <View
    :class="props.isSelected ? 'bench-row bench-row-selected' : 'bench-row'"
  >
    <Text class="bench-row-id">{{ String(props.row.id) }}</Text>
    <Pressable class="flex1" @press="props.onSelect(props.row.id)">
      <Text class="bench-row-label">{{ props.row.label }}</Text>
    </Pressable>
    <Pressable class="bench-row-remove" @press="props.onRemove(props.row.id)">
      <Text class="bench-row-remove-text">×</Text>
    </Pressable>
  </View>
</template>
