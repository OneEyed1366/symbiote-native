<script lang="ts">
import { h } from 'vue';
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';
import {
  readSheetSettings,
  sheetOptionsOf,
} from './sheet/sheet-settings';
import { sheetLog } from './sheet/use-sheet-log';

function renderFooter() {
  return h('view', { testID: 'sheet-footer-bar', class: 'sheet-footer' }, [
    h('text', { class: 'sheet-footer-text' }, 'Sheet footer'),
  ]);
}

// The panel is a plain screen, a sheet is the same route pushed again with the panel as params
// The header stays opaque, a `formSheet` has its own header height accounting
export const sheetDemoScreenOptions: IScreenOptionsResolver = ({ route }) => {
  const settings = readSheetSettings(route.params);
  return {
    title: settings.isSheet ? 'Sheet' : 'Sheet presentation',
    headerShown: true,
    headerTintColor: LINE_COLOR.presentation,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
    ...sheetOptionsOf(settings),
    sheetFooter: settings.isSheet && settings.hasFooter ? renderFooter : undefined,
    onSheetDetentChanged: ({ index, isStable }) =>
      sheetLog.append(
        'detent',
        `detent ${index}, ${isStable ? 'stable' : 'moving'}`,
        { isTick: !isStable },
      ),
  };
};
</script>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from '@symbiote-native/navigation/vue';
import ScreenHero from '../components/ScreenHero.vue';
import { ROUTE_NAME } from '../routes';
import SheetBody from './sheet/SheetBody.vue';
import SheetPanel from './sheet/SheetPanel.vue';

const route = useRoute();
const isSheet = computed(() => readSheetSettings(route.value.params).isSheet);
</script>

<template>
  <!-- First child with no `SafeAreaView` above it, so a taller detent fills the scroll view -->
  <scroll-view testID="sheet-scroll" class="screen">
    <SheetBody v-if="isSheet" />
    <view v-else class="scroll-content">
      <ScreenHero
        :route="ROUTE_NAME.SheetDemo"
        title="Sheet presentation"
        body="Pick how the sheet looks and behaves, then present it. A sheet is this route pushed again."
      />
      <SheetPanel />
    </view>
  </scroll-view>
</template>
