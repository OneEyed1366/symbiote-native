<script setup lang="ts">
import { ref } from 'vue';
import type { ILivePhotoAsset } from '@symbiote-native/live-photo/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { findNewestLivePhoto } from './live-photo-shared';

defineProps<{ color: string }>();
const emit = defineEmits<{ found: [asset: ILivePhotoAsset] }>();

const line = ref('not loaded');

async function load(): Promise<void> {
  line.value = 'asking for access…';
  const result = await findNewestLivePhoto();
  if (result.asset !== null) {
    emit('found', result.asset);
  }
  line.value = result.line;
}
</script>

<template>
  <Scenario
    testID="live-photo-library-scenario"
    title="Show the newest Live Photo without a picker"
    why="A memories widget or a latest-photo header reads the library itself: it finds the newest Live Photo and shows it, with no picker sheet."
    :steps="['Press Load the newest Live Photo and allow access']"
    expect="The newest Live Photo of the device appears in the view below, ready to play. Without a Live Photo the line explains it."
  >
    <ActionButton
      testID="live-photo-library"
      title="Load the newest Live Photo"
      :color="color"
      @press="load"
    />
    <ResultRow
      testID="live-photo-library-result"
      label="Library"
      :value="line"
    />
  </Scenario>
</template>
