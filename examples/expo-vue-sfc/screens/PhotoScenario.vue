<script setup lang="ts">
import { ref } from 'vue';
import type { ICameraCapturedPicture, ICameraViewHandle } from '@symbiote-native/camera/vue';
import ActionButton from '../components/ActionButton.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { QUALITIES, errorLine } from './camera-shared';

const props = defineProps<{ camera: ICameraViewHandle | null; color: string }>();

const picture = ref<ICameraCapturedPicture | null>(null);
const quality = ref(0.7);
const isSilent = ref(false);
const isRaw = ref(false);
const line = ref('no photo yet');

async function shoot(): Promise<void> {
  line.value = 'shooting…';
  try {
    const result = await props.camera?.takePictureAsync({
      quality: quality.value,
      shutterSound: !isSilent.value,
      skipProcessing: isRaw.value,
      exif: true,
    });
    picture.value = result ?? null;
    line.value = result === undefined ? 'no picture returned' : `${result.width}x${result.height} ${result.format}`;
  } catch (error) {
    line.value = `failed: ${errorLine(error)}`;
  }
}
</script>

<template>
  <Scenario
    testID="camera-photo-scenario"
    title="Take a photo for a profile, a receipt or a document"
    why="The core camera task. The app shows a live preview, takes a still on a button and gets a file it can upload or show. Quality trades size for sharpness."
    :steps="['Allow the camera and wait for the preview', 'Press Take photo', 'Change the quality to 0.3 and shoot again']"
    expect="A thumbnail of the shot appears with its pixel size. Quality 0.3 gives the same pixel size as 1, only the file gets smaller and softer."
  >
    <ChoiceRow
      testID="camera-quality"
      label="quality"
      :color="color"
      :value="quality"
      :options="QUALITIES"
      @change="value => (quality = value)"
    />
    <ToggleRow
      testID="camera-silent"
      label="shutter sound off (not allowed everywhere)"
      :value="isSilent"
      :color="color"
      @change="value => (isSilent = value)"
    />
    <ToggleRow
      testID="camera-raw"
      label="skipProcessing: the raw sensor image"
      :value="isRaw"
      :color="color"
      @change="value => (isRaw = value)"
    />
    <ActionButton
      testID="camera-take-photo"
      title="Take photo"
      :color="color"
      @press="shoot"
    />
    <ResultRow
      testID="camera-photo-result"
      label="takePictureAsync"
      :value="line"
    />
    <template v-if="picture !== null">
      <image
        testID="camera-photo"
        :source="{ uri: picture.uri }"
        class="cam-photo"
      />
      <ResultRow
        v-if="picture.exif !== undefined"
        testID="camera-photo-exif"
        label="EXIF tags"
        :value="String(Object.keys(picture.exif).length)"
      />
    </template>
  </Scenario>
</template>
