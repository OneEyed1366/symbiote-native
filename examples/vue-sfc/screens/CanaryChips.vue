<script setup lang="ts">
import { FlatList } from '@symbiote-native/vue';
import { CHIP_GAP, CHIP_WIDTH, chips } from './canary-shared';

const keyOf = (item: { id: string }): string => item.id;
const layoutOf = (_data: unknown, index: number): { length: number; offset: number; index: number } => ({
  length: CHIP_WIDTH + CHIP_GAP,
  offset: (CHIP_WIDTH + CHIP_GAP) * index,
  index,
});
</script>

<template>
  <text class="section-label"> FlatList · 24 chips, windowed </text>
  <FlatList
    testID="chips-list"
    :data="chips"
    :horizontal="true"
    :key-extractor="keyOf"
    :get-item-layout="layoutOf"
    class="chip-list"
  >
    <template #item="{ item }">
      <!-- Size and gap come from script consts a CSS selector cannot read, the color is per chip -->
      <view
        class="chip-card"
        :style="{ width: CHIP_WIDTH, marginRight: CHIP_GAP, backgroundColor: item.color }"
      >
        <text class="chip-number">
          {{ item.index }}
        </text>
      </view>
    </template>
  </FlatList>
</template>
