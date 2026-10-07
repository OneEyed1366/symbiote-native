<script setup lang="ts">
import { ref } from 'vue';
import { CameraView, useCameraPermissions } from '@symbiote-native/camera/vue';
import type { ICameraBarcodeScanningResult, ICameraViewHandle } from '@symbiote-native/camera/vue';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import ResultRow from '../components/ResultRow.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { FACING_OPTIONS, FLASH_OPTIONS, MODE_OPTIONS, SCAN_TYPES, ZOOM_STEP } from './camera-shared';
import type { ICameraSettings } from './camera-shared';

const props = defineProps<{ settings: ICameraSettings; color: string }>();
const emit = defineEmits<{
  patch: [patch: Partial<ICameraSettings>];
  scan: [result: ICameraBarcodeScanningResult];
}>();
const camera = defineModel<ICameraViewHandle | null>('camera', { required: true });

const [permission] = useCameraPermissions();
const status = ref('starting');
const scannerSettings = { barcodeTypes: SCAN_TYPES };

function onReady(): void {
  status.value = 'ready';
  emit('patch', { isReady: true });
}

function zoomBy(step: number): void {
  emit('patch', { zoom: Math.min(1, Math.max(0, props.settings.zoom + step)) });
}
</script>

<template>
  <Card
    testID="camera-stage"
    title="Live preview"
  >
    <CameraView
      v-if="permission?.granted === true"
      ref="camera"
      testID="camera-view"
      class="cam-preview"
      :facing="settings.facing"
      :flash="settings.flash"
      :mode="settings.mode"
      :zoom="settings.zoom"
      :mute="settings.isMuted"
      :enableTorch="settings.isTorchOn"
      :active="settings.isActive"
      :barcodeScannerSettings="scannerSettings"
      @barcodeScanned="result => emit('scan', result)"
      @cameraReady="onReady"
      @mountError="event => (status = `mount error: ${event.message}`)"
    />
    <view
      v-else
      testID="camera-placeholder"
      class="cam-placeholder"
    >
      <text class="hero-body">
        Allow the camera above to see the preview here.
      </text>
    </view>
    <ResultRow
      testID="camera-status"
      label="Session"
      :value="status"
    />
    <ChoiceRow
      testID="camera-facing"
      label="facing"
      :color="color"
      :value="settings.facing"
      :options="FACING_OPTIONS"
      @change="facing => emit('patch', { facing })"
    />
    <ChoiceRow
      testID="camera-flash"
      label="flash"
      :color="color"
      :value="settings.flash"
      :options="FLASH_OPTIONS"
      @change="flash => emit('patch', { flash })"
    />
    <ChoiceRow
      testID="camera-mode"
      label="mode"
      :color="color"
      :value="settings.mode"
      :options="MODE_OPTIONS"
      @change="mode => emit('patch', { mode })"
    />
    <ResultRow
      testID="camera-zoom"
      label="zoom (0 to 1)"
      :value="settings.zoom.toFixed(2)"
    />
    <view class="button-row">
      <ActionButton
        testID="camera-zoom-out"
        title="Zoom out"
        :color="color"
        @press="zoomBy(-ZOOM_STEP)"
      />
      <ActionButton
        testID="camera-zoom-in"
        title="Zoom in"
        :color="color"
        @press="zoomBy(ZOOM_STEP)"
      />
    </view>
    <ToggleRow
      testID="camera-torch"
      label="torch (a lamp for the back camera)"
      :value="settings.isTorchOn"
      :color="color"
      @change="isTorchOn => emit('patch', { isTorchOn })"
    />
    <ToggleRow
      testID="camera-mute"
      label="record video without sound"
      :value="settings.isMuted"
      :color="color"
      @change="isMuted => emit('patch', { isMuted })"
    />
  </Card>
</template>
