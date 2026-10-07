<script setup lang="ts">
import { computed, ref } from 'vue';
import { isCameraAvailableAsync, useCameraPermissions, useMicrophonePermissions } from '@symbiote-native/camera/vue';
import ActionButton from '../components/ActionButton.vue';
import Card from '../components/Card.vue';
import ResultRow from '../components/ResultRow.vue';
import { errorLine } from './camera-shared';

defineProps<{ color: string }>();

const [camera, requestCamera] = useCameraPermissions();
const [microphone, requestMicrophone] = useMicrophonePermissions();
const availability = ref('not checked');

const cameraText = computed(() =>
  camera.value === null ? 'checking…' : `${camera.value.status}, can ask again: ${String(camera.value.canAskAgain)}`,
);
const microphoneText = computed(() => (microphone.value === null ? 'checking…' : microphone.value.status));

async function checkAvailable(): Promise<void> {
  try {
    availability.value = String(await isCameraAvailableAsync());
  } catch (error) {
    availability.value = `failed: ${errorLine(error)}`;
  }
}
</script>

<template>
  <Card
    testID="camera-permission-card"
    title="Permissions and hardware"
  >
    <ResultRow
      testID="camera-permission"
      label="Camera"
      :value="cameraText"
    />
    <ResultRow
      testID="camera-mic-permission"
      label="Microphone (video sound)"
      :value="microphoneText"
    />
    <view class="button-row">
      <ActionButton
        testID="camera-request"
        title="Allow the camera"
        :color="color"
        @press="requestCamera()"
      />
      <ActionButton
        testID="camera-request-mic"
        title="Allow the microphone"
        :color="color"
        @press="requestMicrophone()"
      />
    </view>
    <ActionButton
      testID="camera-available"
      title="isCameraAvailableAsync()"
      :color="color"
      @press="checkAvailable"
    />
    <ResultRow
      testID="camera-available-result"
      label="Has a camera"
      :value="availability"
    />
    <text class="hero-body">
      The iOS simulator has no camera: the preview stays black, use a device. The Android emulator draws a virtual scene.
    </text>
  </Card>
</template>
