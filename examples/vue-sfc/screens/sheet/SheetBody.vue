<!-- What the sheet shows of itself: its settings, the detent events and the way out -->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from '@symbiote-native/navigation/vue';
import ActionButton from '../../components/ActionButton.vue';
import { LINE_COLOR } from '../../navigation-lines';
import { ROUTE_NAME } from '../../routes';
import { useRouteSettings } from '../use-route-settings';
import { readSheetSettings, sheetParamsOf } from './sheet-settings';
import { useSheetLines } from './use-sheet-log';

const COLOR = LINE_COLOR.presentation;
const FILLER_ROWS = Array.from({ length: 14 }, (_row, index) => index + 1);

const route = useRoute();
const { settings, navigation } = useRouteSettings(readSheetSettings);
const lines = useSheetLines();

const summary = computed(() => {
  const sheet = readSheetSettings(route.value.params);
  return `detents ${sheet.detents}, initial ${sheet.initialDetent}, undimmed ${sheet.undimmed}`;
});
const lastEvent = computed(
  () => lines.value[lines.value.length - 1]?.text ?? 'No detent event yet',
);
</script>

<template>
  <view class="scroll-content">
    <text class="recipe-question">Sheet</text>
    <text testID="sheet-summary" class="info-text">{{ summary }}</text>
    <text testID="sheet-last-event" class="list-row-text">{{ lastEvent }}</text>
    <ActionButton
      testID="sheet-dismiss"
      title="Dismiss"
      :onPress="() => navigation.pop()"
      :color="COLOR"
    />
    <ActionButton
      testID="sheet-present-another"
      title="Present another sheet"
      :onPress="
        () => navigation.push(ROUTE_NAME.SheetDemo, sheetParamsOf(settings))
      "
      :color="COLOR"
    />
    <view v-for="row in FILLER_ROWS" :key="row" class="scroll-demo-row">
      <text class="list-row-text">{{ `Scroll row ${row}` }}</text>
    </view>
  </view>
</template>
