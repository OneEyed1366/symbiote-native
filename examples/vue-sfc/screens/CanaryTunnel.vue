<script setup lang="ts">
import { ref } from 'vue';
import ActionButton from '../components/ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';
import { overlayTunnel } from './canary-shared';

const COLOR = LINE_COLOR.primitives;
// PascalCase so the SFC compiler registers it as a template tag
const { In: TunnelIn } = overlayTunnel;

const isShown = ref(false);
</script>

<template>
  <!-- createTunnel needs no ref or target: In registers its slot, Out reads it back anywhere -->
  <ActionButton
    testID="tunnel-toast-open"
    title="Show toast (createTunnel)"
    :color="COLOR"
    @press="isShown = true"
  />
  <TunnelIn v-if="isShown">
    <view
      testID="tunnel-toast-card"
      class="modal-card"
    >
      <text class="modal-body"> Ported via createTunnel ✦ </text>
      <ActionButton
        testID="tunnel-toast-dismiss"
        title="Dismiss"
        :color="COLOR"
        @press="isShown = false"
      />
    </view>
  </TunnelIn>
</template>
