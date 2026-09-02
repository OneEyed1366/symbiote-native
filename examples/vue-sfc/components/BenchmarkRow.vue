<!--
  One benchmark list row — id, label, remove, and a TextInput as the last child. Nothing
  decorative: what is measured is the engine's commit path, not a row's own layout cost. Vue SFC
  twin of the BenchmarkRow inside .examples/react/screens/BenchmarkScreen.tsx.

  This expands to exactly TEN native views, and that count is load-bearing: it is what turns a row
  count into a view count on the screen's own readout, and a port that produces 9 or 11 puts every
  number ~10% off the other canaries. View 1 · Text+RawText x3 = 6 · Pressable→View x2 = 2 ·
  TextInput 1 (renderTextInput emits one element with no children).

  The input is UNCONDITIONAL. It used to sit behind a row-shape toggle so one TextInput could be
  priced as a delta; that number has been taken, and a second arm only splits every later
  measurement in two. No multiline / onChangeText / ref: each makes the lowering transform refuse,
  and the lowered element is what is being measured. `value` rather than `defaultValue` on purpose
  — a CONTROLLED input runs the behavior's afterCommit handshake on every commit, which is the
  work tier-2 moved onto the node.

  `onSelect` / `onRemove` are plain callback PROPS rather than Vue emits, the same choice
  ActionButton.vue makes: the parent hands down ONE stable function identity for the whole list,
  so an untouched row's props compare equal and Vue skips re-rendering it. An `@select` emit would
  need an inline handler per row, which cannot be hoisted out of a v-for scope — every row would
  then re-render on every operation and the measurement would be of that, not of the engine.
-->
<script setup lang="ts">
import { Pressable, Text, TextInput, View } from '@symbiote-native/vue';

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
    <TextInput class="bench-row-input" :value="props.row.label" />
  </View>
</template>
