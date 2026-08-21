<!--
  Sticky path B — SectionList with stickySectionHeadersEnabled, i.e. VirtualizedSectionList over
  VirtualizedList. This is the path the frame-drop regression actually showed up on: each scroll
  frame additionally runs the windowing pass (cell render, viewability) and the sticky math is
  computed inside the list. If path A holds its frame rate and this one does not, the cost is
  virtualization rather than stickiness. Vue SFC twin of StickySectionListBlock in
  .examples/react/screens/BenchmarkScreen.tsx — the cells arrive through the #sectionHeader /
  #item scoped slots, which is how @symbiote-native/vue spells renderSectionHeader / renderItem.

  No props, for the same reason as BenchmarkStickyScroll.vue: an operation in the parent must not
  re-render this box.
-->
<script setup lang="ts">
import { SectionList, Text, View, type ISection } from '@symbiote-native/vue';

const SECTION_LIST_SECTION_COUNT = 16;
const SECTION_LIST_ROWS_PER_SECTION = 32;
const SECTION_LIST_ROW_HEIGHT = 30;
const SECTION_LIST_HEADER_HEIGHT = 28;
// Every section is flattened to a header row, its item rows, then a FOOTER row - emitted even
// with no section-footer slot, in which case it paints nothing and occupies no height. The
// getItemLayout arithmetic below has to account for that row existing in the index space.
const SECTION_LIST_FOOTER_HEIGHT = 0;
const SECTION_LIST_ENTRIES_PER_SECTION = 1 + SECTION_LIST_ROWS_PER_SECTION + 1;
const SECTION_LIST_SECTION_EXTENT =
  SECTION_LIST_HEADER_HEIGHT +
  SECTION_LIST_ROWS_PER_SECTION * SECTION_LIST_ROW_HEIGHT;

type IStickyListItem = {
  id: string;
  label: string;
};

/**
 * The fixed-layout fast path for sticky path B. Without it the list learns a cell's extent only
 * after measuring it, so a fast drag outruns measurement and leaves the window blank for seconds -
 * observed on this very screen, scrolling past section 4.
 *
 * The index is FLAT over the whole stream (this is React Native's shape, not a section-relative
 * one), so it is decoded back into "which section, and what within it" here. Rows are uniform, so
 * a section always spans the same extent and the section's own offset is a multiplication.
 */
function sectionListItemLayout(
  _sections: unknown,
  index: number,
): { length: number; offset: number; index: number } {
  const sectionIndex = Math.floor(index / SECTION_LIST_ENTRIES_PER_SECTION);
  const withinSection = index - sectionIndex * SECTION_LIST_ENTRIES_PER_SECTION;
  const sectionOffset = sectionIndex * SECTION_LIST_SECTION_EXTENT;
  if (withinSection === 0) {
    return { length: SECTION_LIST_HEADER_HEIGHT, offset: sectionOffset, index };
  }
  if (withinSection === SECTION_LIST_ENTRIES_PER_SECTION - 1) {
    // The zero-height footer sits exactly where the next section begins.
    return {
      length: SECTION_LIST_FOOTER_HEIGHT,
      offset: sectionOffset + SECTION_LIST_SECTION_EXTENT,
      index,
    };
  }
  return {
    length: SECTION_LIST_ROW_HEIGHT,
    offset:
      sectionOffset +
      SECTION_LIST_HEADER_HEIGHT +
      (withinSection - 1) * SECTION_LIST_ROW_HEIGHT,
    index,
  };
}

// Every section is far taller than the 320px viewport, so headers genuinely cross-talk while
// scrolling instead of each one appearing and leaving on its own.
const BENCHMARK_SECTIONS: ISection<IStickyListItem>[] = Array.from(
  { length: SECTION_LIST_SECTION_COUNT },
  (_value, section) => ({
    title: `SECTION ${section + 1}`,
    data: Array.from(
      { length: SECTION_LIST_ROWS_PER_SECTION },
      (_rowValue, row) => ({
        id: `s${section}-r${row}`,
        label: `row ${section + 1}.${row + 1}`,
      }),
    ),
  }),
);

const keyExtractor = (item: IStickyListItem): string => item.id;

// Heights are pinned inline rather than in App.css because both numbers have to agree with
// sectionListItemLayout's arithmetic; splitting that pair across two files is how it silently
// drifts apart.
const sectionHeaderStyle = { height: SECTION_LIST_HEADER_HEIGHT };
const sectionRowStyle = { height: SECTION_LIST_ROW_HEIGHT };
</script>

<template>
  <Text class="section-label"
    >STICKY PATH B · SectionList · stickySectionHeadersEnabled</Text
  >
  <SectionList
    testID="benchmark-sticky-section-list"
    :sections="BENCHMARK_SECTIONS"
    :key-extractor="keyExtractor"
    :sticky-section-headers-enabled="true"
    class="bench-sticky"
    :scroll-event-throttle="16"
    :get-item-layout="sectionListItemLayout"
  >
    <template #sectionHeader="{ section }">
      <Text class="section-header" :style="sectionHeaderStyle">{{
        section.title
      }}</Text>
    </template>
    <template #item="{ item }">
      <View class="parity-row" :style="sectionRowStyle">
        <Text class="list-row-text">{{ item.label }}</Text>
      </View>
    </template>
  </SectionList>
  <Text class="note-text">{{
    `${SECTION_LIST_SECTION_COUNT} sections x ${SECTION_LIST_ROWS_PER_SECTION} rows — windowed, sticky math inside the list.`
  }}</Text>
</template>
