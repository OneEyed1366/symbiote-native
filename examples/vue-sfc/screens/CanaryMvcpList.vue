<script setup lang="ts">
import { ref } from 'vue';
import { FlatList } from '@symbiote-native/vue';
import ActionButton from '../components/ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';
import { makeRows } from './canary-shared';

const MVCP_START = 20;
const PREPEND_COUNT = 5;
const KEEP_VISIBLE = { minIndexForVisible: 0 };

const items = ref(makeRows(0, MVCP_START));
let head = 0;
const keyOf = (item: { id: string }): string => item.id;

function prepend(): void {
  head -= PREPEND_COUNT;
  items.value = [...makeRows(head, PREPEND_COUNT), ...items.value];
}
</script>

<template>
  <!-- PASS: scroll a bit, tap Prepend and the visible rows do not jump -->
  <text class="section-label"> MVCP · prepend without jump </text>
  <FlatList
    :data="items"
    :key-extractor="keyOf"
    :maintain-visible-content-position="KEEP_VISIBLE"
    nested-scroll-enabled
    class="box-list160"
  >
    <template #item="{ item }">
      <view class="mvcp-row">
        <text class="list-row-text">
          {{ item.label }}
        </text>
      </view>
    </template>
    <!-- The divider is list chrome between measured cells: the offset table has to count it -->
    <template #separator>
      <view class="mvcp-divider" />
    </template>
  </FlatList>
  <ActionButton
    title="Prepend 5"
    :color="LINE_COLOR.primitives"
    @press="prepend"
  />
</template>
