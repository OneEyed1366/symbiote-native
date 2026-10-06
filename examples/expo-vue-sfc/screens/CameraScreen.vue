<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import type { ICameraBarcodeScanningResult, ICameraViewHandle } from '@symbiote-native/camera/vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import CameraExplorerCard from './CameraExplorerCard.vue';
import CameraPermissionCard from './CameraPermissionCard.vue';
import CameraStage from './CameraStage.vue';
import PhotoScenario from './PhotoScenario.vue';
import ScanScenario from './ScanScenario.vue';
import VideoScenario from './VideoScenario.vue';
import { INITIAL_SETTINGS, pushScan } from './camera-shared';
import type { ICameraSettings } from './camera-shared';

const ROUTE = ROUTE_NAME.Camera;
const color = lineColorOf(ROUTE);

const camera = shallowRef<ICameraViewHandle | null>(null);
const settings = ref<ICameraSettings>({ ...INITIAL_SETTINGS });
const scans = shallowRef<readonly ICameraBarcodeScanningResult[]>([]);

function patch(change: Partial<ICameraSettings>): void {
  settings.value = { ...settings.value, ...change };
}

function onScan(result: ICameraBarcodeScanningResult): void {
  scans.value = pushScan(scans.value, result);
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="camera-scroll"
    title="Camera"
    body="A live camera view with photos, video recording and barcode scanning. It needs a real camera: use a device, the iOS simulator has none."
  >
    <CameraPermissionCard :color="color" />
    <CameraStage
      v-model:camera="camera"
      :settings="settings"
      :color="color"
      @patch="patch"
      @scan="onScan"
    />
    <PhotoScenario
      :camera="camera"
      :color="color"
    />
    <VideoScenario
      :camera="camera"
      :mode="settings.mode"
      :color="color"
    />
    <ScanScenario
      :scans="scans"
      :color="color"
    />
    <CameraExplorerCard
      :camera="camera"
      :isActive="settings.isActive"
      :color="color"
      @patch="patch"
    />
  </ScreenShell>
</template>
