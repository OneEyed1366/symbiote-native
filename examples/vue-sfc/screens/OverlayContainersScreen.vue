<script lang="ts">
import type { IScreenOptionsResolver } from '@symbiote-native/navigation/vue';
import { LINE_COLOR } from '../navigation-lines';
import { readIsModal } from './read-params';

// The same route opens twice, the second time as a modal that covers the first
export const overlayContainersScreenOptions: IScreenOptionsResolver = ({
  route,
}) => {
  const isModal = readIsModal(route.params);
  return {
    title: isModal ? 'Overlays (modal)' : 'Overlays and containers',
    headerShown: true,
    headerTintColor: LINE_COLOR.structure,
    headerTitleColor: '#ffffff',
    headerStyle: { backgroundColor: '#0b1622' },
    headerUserInterfaceStyle: 'dark',
    stackPresentation: isModal ? 'modal' : undefined,
  };
};
</script>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from '@symbiote-native/navigation/vue';
import ScreenHero from '../components/ScreenHero.vue';
import { ROUTE_NAME } from '../routes';
import OverlayRecipes from './overlays/OverlayRecipes.vue';
import ToastHost from './overlays/ToastHost.vue';

const isOverlayModal = ref(false);
const route = useRoute();
const isModal = computed(() => readIsModal(route.value.params));
</script>

<template>
  <view class="screen">
    <scroll-view testID="overlays-scroll" class="screen">
      <view class="scroll-content">
        <ScreenHero
          :route="ROUTE_NAME.OverlayContainers"
          title="Overlays and containers"
          body="What is drawn above a native modal and what holds screens without a navigator."
        />
        <OverlayRecipes
          :is-overlay-modal="isOverlayModal"
          :on-overlay-modal-change="value => (isOverlayModal = value)"
        />
      </view>
    </scroll-view>
    <ToastHost v-if="!isModal" :is-overlay-modal="isOverlayModal" />
  </view>
</template>
