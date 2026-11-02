<!-- Drawn by the screen below the modal, the overlay one rides in its own window -->
<script setup lang="ts">
import { computed, watchEffect } from 'vue';
import { FullWindowOverlay } from '@symbiote-native/navigation/vue';
import { toastStore, useToast } from './use-toast';

defineProps<{ isOverlayModal: boolean }>();

const TOAST_MS = 2_500;

const toast = useToast();
const toastId = computed(() => toast.value?.id);
watchEffect(onCleanup => {
  if (toastId.value === undefined) return;
  const timer = setTimeout(toastStore.hide, TOAST_MS);
  onCleanup(() => clearTimeout(timer));
});
</script>

<template>
  <view v-if="toast?.kind === 'tree'" class="toast toast-tree">
    <text class="toast-text">Drawn by the screen below the modal</text>
  </view>
  <FullWindowOverlay
    v-else-if="toast?.kind === 'overlay'"
    :unstable-accessibility-container-view-is-modal="isOverlayModal"
  >
    <view class="toast toast-overlay">
      <text class="toast-text">Drawn in a FullWindowOverlay</text>
    </view>
  </FullWindowOverlay>
</template>
