<script setup lang="ts">
import { ref } from 'vue';
import { Modal } from '@symbiote-native/vue';
import ActionButton from '../components/ActionButton.vue';
import { LINE_COLOR } from '../navigation-lines';

const COLOR = LINE_COLOR.primitives;

const isOpen = ref(false);
</script>

<template>
  <ActionButton
    testID="modal-open"
    title="Open modal"
    :color="COLOR"
    @press="isOpen = true"
  />
  <Modal
    :visible="isOpen"
    :transparent="true"
    animation-type="fade"
    @request-close="isOpen = false"
  >
    <!-- A transparent modal paints its own dim layer -->
    <view class="modal-overlay">
      <view
        testID="modal-card"
        class="modal-card"
      >
        <text class="modal-title"> It's a Modal </text>
        <text class="modal-body">
          Rendered through ModalHostView — its own native window, same Fabric tree.
        </text>
        <ActionButton
          testID="modal-close"
          title="Close"
          :color="COLOR"
          @press="isOpen = false"
        />
      </view>
    </view>
  </Modal>
</template>
