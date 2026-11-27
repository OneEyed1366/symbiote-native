<script lang="ts">
  // Both sticky paths sit under the buttons, so the meter above stays on screen while either
  // box is dragged. Neither box reads `rows`, so a benchmark run never re-renders them
  import { SectionList } from '@symbiote-native/svelte';
  import {
    BENCHMARK_SECTIONS,
    SCROLL_EVENT_THROTTLE_MS,
    SECTION_LIST_HEADER_HEIGHT,
    SECTION_LIST_ROW_HEIGHT,
    SECTION_LIST_ROWS_PER_SECTION,
    SECTION_LIST_SECTION_COUNT,
    STICKY_ENTRIES,
    STICKY_KIND,
    STICKY_SECTION_COUNT,
    sectionListItemLayout,
  } from '../screens/bench-sticky';
</script>

<text class="section-label">STICKY PATH A - ScrollView - sticky-header tag</text>
<!-- A header is marked with the `sticky-header` tag, not named by an index
  The collision point comes from the owner's document order, so a tag cannot drift -->
<scroll-view
  testID="benchmark-sticky-scroll"
  class="bench-sticky"
  scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
  nestedScrollEnabled
>
  {#each STICKY_ENTRIES as entry (entry.key)}
    {#if entry.kind === STICKY_KIND.Header}
      <sticky-header>
        <text class="section-header">{entry.text}</text>
      </sticky-header>
    {:else}
      <text class="list-row-text">{entry.text}</text>
    {/if}
  {/each}
</scroll-view>
<text class="note-text">
  {`${STICKY_SECTION_COUNT} sections, every row mounted, no virtualization in the frame.`}
</text>

<text class="section-label">
  STICKY PATH B - SectionList - stickySectionHeadersEnabled
</text>
<SectionList
  testID="benchmark-sticky-section-list"
  sections={BENCHMARK_SECTIONS}
  keyExtractor={item => item.id}
  stickySectionHeadersEnabled
  class="bench-sticky"
  scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS}
  getItemLayout={sectionListItemLayout}
>
  {#snippet sectionHeader({ section })}
    <text class="section-header" style={{ height: SECTION_LIST_HEADER_HEIGHT }}>
      {section.title}
    </text>
  {/snippet}
  {#snippet item({ item })}
    <view class="parity-row" style={{ height: SECTION_LIST_ROW_HEIGHT }}>
      <text class="list-row-text">{item.label}</text>
    </view>
  {/snippet}
</SectionList>
<text class="note-text">
  {`${SECTION_LIST_SECTION_COUNT} sections x ${SECTION_LIST_ROWS_PER_SECTION} rows, windowed, with the sticky math inside the list.`}
</text>
<text class="note-text">
  Drag inside a box (not the page) and watch the counters above. The two boxes differ only in
  which sticky implementation carries the frame.
</text>
