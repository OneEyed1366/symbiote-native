<script lang="ts">
  import { FlatList } from '@symbiote-native/svelte';

  const CHIP_WIDTH = 72;
  const CHIP_GAP = 12;
  const CHIP_COUNT = 24;

  const chips = Array.from({ length: CHIP_COUNT }, (_unused, index) => ({
    id: `chip-${index}`,
    index,
    color: `hsl(${(index * 37) % 360} 70% 55%)`,
  }));
</script>

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
  {#snippet item({ item })}
    <!-- Size and gap come from script consts a CSS selector cannot read, the color is per chip -->
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
