<script setup lang="ts">
import { ref } from 'vue';
import type { ILivePhotoAsset } from '@symbiote-native/live-photo/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { pickLivePhoto } from './live-photo-shared';

defineProps<{ color: string }>();
const emit = defineEmits<{ picked: [asset: ILivePhotoAsset] }>();

const line = ref('nothing picked');

async function pick(): Promise<void> {
  line.value = 'opening the library…';
  const result = await pickLivePhoto();
  if (result.asset !== null) {
    emit('picked', result.asset);
  }
  line.value = result.line;
}
</script>

<template>
  <Scenario
    testID="live-photo-pick-scenario"
    title="Let the user choose a Live Photo to view"
    why="A Live Photo is a still with a few seconds of motion around it. A gallery, a profile editor or a chat shows the chosen one and plays it on a press, as the Photos app does."
    :steps="['Press Pick a Live Photo and choose one with the LIVE badge', 'Press and hold the picture below']"
    expect="The picked Live Photo shows as a still. While you hold a finger on it the motion plays with sound, and on release it settles back to the still."
  >
    <ActionButton
      testID="live-photo-pick"
      title="Pick a Live Photo"
      :color="color"
      @press="pick"
    />
    <ResultRow
      testID="live-photo-pick-result"
      label="Picker"
      :value="line"
    />
  </Scenario>
</template>
