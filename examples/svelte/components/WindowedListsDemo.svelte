<script lang="ts">
  // The FlatList windowing checks split off CanaryScreen.svelte to keep it under 400 lines.
  import { FlatList } from '@symbiote-native/svelte';
  import ActionButton from './ActionButton.svelte';

  const ACCENT = '#ff3e00';
  const CHIP_WIDTH = 72;
  const CHIP_GAP = 12;
  const CHIP_COUNT = 24;
  const MVCP_ROW_COUNT = 20;
  const PREPEND_COUNT = 5;

  const chips = Array.from({ length: CHIP_COUNT }, (_unused, index) => ({
    id: `chip-${index}`,
    index,
    color: `hsl(${(index * 37) % 360} 70% 55%)`,
  }));

  let mvcpItems = $state(
    Array.from({ length: MVCP_ROW_COUNT }, (_unused, index) => ({
      id: `row-${index}`,
      label: `item ${index}`,
    })),
  );
  let mvcpHead = 0;

  function onPrepend(): void {
    mvcpHead -= PREPEND_COUNT;
    const head = mvcpHead;
    const prepended = Array.from(
      { length: PREPEND_COUNT },
      (_unused, index) => {
        const n = head + index;
        return { id: `row-${n}`, label: `item ${n}` };
      },
    );
    mvcpItems = [...prepended, ...mvcpItems];
  }
</script>

<!-- Horizontal FlatList: real windowing. -->
<text class="section-label">FlatList · 24 chips, windowed</text>
<FlatList
  testID="chips-list"
  data={chips}
  horizontal
  keyExtractor={item => item.id}
  getItemLayout={(_data, index) => ({
    length: CHIP_WIDTH + CHIP_GAP,
    offset: (CHIP_WIDTH + CHIP_GAP) * index,
    index,
  })}
  class="chip-list"
>
  {#snippet item({
    item,
  })}<!-- width/marginRight stay dynamic - CHIP_WIDTH/CHIP_GAP a CSS
    selector can't read; backgroundColor is per-chip (item.color). -->
    <view
      class="chip-card"
      style={{
        width: CHIP_WIDTH,
        marginRight: CHIP_GAP,
        backgroundColor: item.color,
      }}
    >
      <text class="chip-number">{item.index}</text>
    </view>
  {/snippet}
</FlatList>
<!-- maintainVisibleContentPosition. PASS: scroll down a bit, tap Prepend: the rows you are
     looking at DO NOT jump; new items appear above without shifting the viewport. FAIL: the
     list jumps to the top. box-list160 is shared with the scroll-driven header demo. -->
<text class="section-label">MVCP · prepend without jump</text>
<FlatList
  testID="mvcp-list"
  nestedScrollEnabled
  data={mvcpItems}
  keyExtractor={item => item.id}
  maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
  class="box-list160"
>
  {#snippet item({ item })}
    <view class="mvcp-row">
      <text class="list-row-text">{item.label}</text>
    </view>
  {/snippet}<!--
    This list measures its own cells (no getItemLayout); the divider is chrome BETWEEN rows,
    so it belongs to the gap, not either row's height - prepend-without-jump is exactly where
    an offset a few points off becomes visible.
  -->
  {#snippet separator()}
    <view class="mvcp-divider" />
  {/snippet}
</FlatList>
<ActionButton title="Prepend 5" color={ACCENT} onPress={onPrepend} />
