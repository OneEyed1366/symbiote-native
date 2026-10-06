<script setup lang="ts">
import { getAvailableVideoCodecsAsync } from '@symbiote-native/camera/vue';
import type { ICameraViewHandle } from '@symbiote-native/camera/vue';
import CallConsole from '../components/CallConsole.vue';
import Explorer from '../components/Explorer.vue';
import ToggleRow from '../components/ToggleRow.vue';
import type { ICameraSettings } from './camera-shared';

const props = defineProps<{ camera: ICameraViewHandle | null; isActive: boolean; color: string }>();
const emit = defineEmits<{ patch: [patch: Partial<ICameraSettings>] }>();

const calls = [
  { label: 'getAvailablePictureSizesAsync', run: async () => props.camera?.getAvailablePictureSizesAsync() },
  { label: 'getAvailableLensesAsync', run: async () => props.camera?.getAvailableLensesAsync() },
  { label: 'getSupportedFeatures', run: async () => props.camera?.getSupportedFeatures() },
  { label: 'getAvailableVideoCodecsAsync', run: getAvailableVideoCodecsAsync },
  { label: 'pausePreview', run: async () => props.camera?.pausePreview() },
  { label: 'resumePreview', run: async () => props.camera?.resumePreview() },
];
</script>

<template>
  <Explorer
    testID="camera-explorer"
    :color="color"
  >
    <ToggleRow
      testID="camera-active"
      label="active: the session runs (iOS)"
      :value="isActive"
      :color="color"
      @change="value => emit('patch', { isActive: value })"
    />
    <CallConsole
      prefix="camera-calls"
      title="Handle calls"
      :color="color"
      hint="Each call runs on the live preview above."
      :calls="calls"
    />
  </Explorer>
</template>
