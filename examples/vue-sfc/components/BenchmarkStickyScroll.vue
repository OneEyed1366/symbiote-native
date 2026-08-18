<!--
  Sticky path A — a plain ScrollView with stickyHeaderIndices. Stickiness is computed in JS (the
  adapter wraps each flagged child and drives it off the scroll offset), but nothing else runs per
  frame: every child is mounted up front, there is no windowing. Vue SFC twin of
  StickyScrollViewBlock in .examples/react/screens/BenchmarkScreen.tsx.

  It takes NO props on purpose. That is Vue's equivalent of React's memo() here: a component whose
  vnode carries no dynamic prop is skipped by shouldUpdateComponent, so a benchmark run in the
  parent never re-renders these 800 children and never contaminates the numbers next to the
  buttons.
-->
<script setup lang="ts">
import { h, type FunctionalComponent, type VNode } from 'vue';
import { ScrollView, Text } from '@symbiote-native/vue';

const STICKY_SECTION_COUNT = 200;
const STICKY_ROWS_PER_SECTION = 3;

// stickyHeaderIndices addresses DIRECT children of the content container, so the sections are
// flattened into one list: a header followed by its rows, repeating.
const headerIndices = Array.from(
  { length: STICKY_SECTION_COUNT },
  (_value, section) => section * (STICKY_ROWS_PER_SECTION + 1),
);

function buildStickyChildren(): VNode[] {
  return Array.from({ length: STICKY_SECTION_COUNT }, (_value, section) => [
    h(
      Text,
      { key: `sticky-header-${section}`, class: 'section-header' },
      () => `SECTION ${section + 1}`,
    ),
    ...Array.from({ length: STICKY_ROWS_PER_SECTION }, (_rowValue, row) =>
      h(
        Text,
        { key: `sticky-row-${section}-${row}`, class: 'list-row-text' },
        () => `row ${section + 1}.${row + 1}`,
      ),
    ),
  ]).flat();
}

// The one thing this block cannot say in template syntax. The adapter maps stickyHeaderIndices
// over the ScrollView's default slot POSITIONALLY, and a template `v-for` compiles to a single
// Fragment vnode - index 4 would then address nothing and the whole list would end up inside one
// sticky wrapper. Built with h() so the slot really is 800 flat siblings, which is what the
// indices above mean.
const StickyScrollBody: FunctionalComponent = () =>
  h(
    ScrollView,
    {
      testID: 'benchmark-sticky-scroll',
      class: 'bench-sticky',
      stickyHeaderIndices: headerIndices,
      scrollEventThrottle: 16,
      nestedScrollEnabled: true,
    },
    () => buildStickyChildren(),
  );
</script>

<template>
  <Text class="section-label"
    >STICKY PATH A · ScrollView · stickyHeaderIndices</Text
  >
  <StickyScrollBody />
  <Text class="note-text">{{
    `${STICKY_SECTION_COUNT} sections, every row mounted — no virtualization in the frame.`
  }}</Text>
</template>
