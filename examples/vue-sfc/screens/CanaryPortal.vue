<script setup lang="ts">
import { ref } from 'vue';
import type { IHostInstance } from '@symbiote-native/vue';
import ActionButton from '../components/ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';

defineProps<{ host: IHostInstance | null }>();

const COLOR = LINE_COLOR.primitives;

const isShown = ref(false);
</script>

<template>
  <!-- Teleport moves the card into the overlay host, a sibling of the scroll view -->
  <ActionButton
    testID="toast-open"
    title="Show toast (Teleport)"
    :color="COLOR"
    @press="isShown = true"
  />
  <Teleport
    v-if="host"
    :to="host"
  >
    <view
      v-if="isShown"
      testID="toast-card"
      class="modal-card"
    >
      <text class="modal-body"> Ported via Teleport ✦ </text>
      <ActionButton
        testID="toast-dismiss"
        title="Dismiss"
        :color="COLOR"
        @press="isShown = false"
      />
    </view>
  </Teleport>
</template>
