<script setup lang="ts">
import { ref } from 'vue';
import {
  getPendingResultAsync,
  launchCameraAsync,
  launchImageLibraryAsync,
} from '@symbiote-native/image-picker/vue';
import type { IImagePickerAsset } from '@symbiote-native/image-picker/vue';
import ActionButton from '../components/ActionButton.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { toPickerOptions } from './image-picker-form';
import type { IForm } from './image-picker-form';
import ImagePickerAsset from './ImagePickerAsset.vue';

const props = defineProps<{ form: IForm; color: string }>();

const status = ref('idle');
const assets = ref<IImagePickerAsset[]>([]);

function launch(launcher: typeof launchImageLibraryAsync): void {
  status.value = 'picker open…';
  launcher(toPickerOptions(props.form))
    .then(result => {
      status.value = result.canceled ? 'canceled' : `picked ${result.assets.length}`;
      assets.value = result.canceled ? [] : result.assets;
    })
    .catch((error: Error) => {
      status.value = `failed: ${error.message}`;
    });
}

function handlePending(): void {
  getPendingResultAsync()
    .then(pending => {
      status.value = pending === null ? 'no pending result' : JSON.stringify(pending);
    })
    .catch((error: Error) => {
      status.value = `failed: ${error.message}`;
    });
}
</script>

<template>
  <Scenario
    testID="image-picker-result-card"
    title="Choose a profile photo or take a new one"
    why="Avatars, receipts and attachments start with a photo. The picker gives the app only what the user chooses, so it needs no broad access to the whole library."
    :steps="[
      'Press launchImageLibraryAsync and pick a photo',
      'Press launchCameraAsync and take one (needs a real camera)',
      'Cancel once',
    ]"
    expect="The status says picked N and each photo shows its size and file URI with a preview. Cancelling says canceled."
  >
    <ActionButton
      testID="image-picker-library-button"
      title="launchImageLibraryAsync"
      :onPress="() => launch(launchImageLibraryAsync)"
      :color="color"
    />
    <ActionButton
      testID="image-picker-camera-button"
      title="launchCameraAsync"
      :onPress="() => launch(launchCameraAsync)"
      :color="color"
    />
    <ActionButton
      testID="image-picker-pending-button"
      title="getPendingResultAsync (Android)"
      :onPress="handlePending"
      :color="color"
    />
    <ResultRow testID="image-picker-status" label="canceled / assets" :value="status" />
    <ImagePickerAsset
      v-for="(asset, index) in assets"
      :key="asset.uri"
      :asset="asset"
      :index="index"
    />
  </Scenario>
</template>
