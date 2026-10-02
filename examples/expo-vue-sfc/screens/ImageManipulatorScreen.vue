<script setup lang="ts">
import { ref, shallowRef } from 'vue';
import { manipulate, manipulateAsync } from '@symbiote-native/image-manipulator/vue';
import type {
  IImageManipulatorContext,
  IImageResult,
} from '@symbiote-native/image-manipulator/vue';
import { launchImageLibraryAsync } from '@symbiote-native/image-picker/vue';
import ActionButton from '../components/ActionButton.vue';
import Explorer from '../components/Explorer.vue';
import Field from '../components/Field.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { INITIAL_OPS, applyActions, toActions, toSaveOptions } from './image-manipulator-ops';
import type { IOps } from './image-manipulator-ops';
import ImageManipulatorHookRunner from './ImageManipulatorHookRunner.vue';
import ImageManipulatorOps from './ImageManipulatorOps.vue';
import ImageManipulatorResult from './ImageManipulatorResult.vue';

const ROUTE = ROUTE_NAME.ImageManipulator;
const color = lineColorOf(ROUTE);

const source = ref('');
const ops = ref<IOps>({ ...INITIAL_OPS });
const status = ref('pick a source image first');
const result = shallowRef<IImageResult | null>(null);

function setOps(patch: Partial<IOps>): void {
  ops.value = { ...ops.value, ...patch };
}

function fail(error: Error): void {
  status.value = `failed: ${error.message}`;
}

const done =
  (label: string) =>
  (saved: IImageResult): void => {
    result.value = saved;
    status.value = label;
  };

function pickSource(): void {
  launchImageLibraryAsync({ mediaTypes: ['images'] })
    .then(picked => {
      if (!picked.canceled) {
        source.value = picked.assets[0].uri;
        status.value = 'source ready';
      }
    })
    .catch(fail);
}

function runChain(): void {
  status.value = 'manipulate()…';
  applyActions(manipulate(source.value), toActions(ops.value))
    .renderAsync()
    .then(image => image.saveAsync(toSaveOptions(ops.value)))
    .then(done('manipulate().renderAsync().saveAsync()'))
    .catch(fail);
}

function runLegacy(): void {
  status.value = 'manipulateAsync()…';
  manipulateAsync(source.value, toActions(ops.value), toSaveOptions(ops.value))
    .then(done('manipulateAsync()'))
    .catch(fail);
}

function runHook(context: IImageManipulatorContext): void {
  status.value = 'hook context…';
  applyActions(context, toActions(ops.value))
    .renderAsync()
    .then(image => image.saveAsync(toSaveOptions(ops.value)))
    .then(done('useImageManipulator().renderAsync().saveAsync()'))
    .catch(fail);
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="image-manipulator-scroll"
    title="Image Manipulator"
    body="Edit a photo on the device before it goes anywhere: resize, rotate, flip, crop and re-compress as JPEG, PNG or WEBP. Smaller uploads, no server round trip."
  >
    <Scenario
      testID="image-manipulator-source-card"
      title="Shrink and straighten a photo before upload"
      why="Phone photos are huge. Resize to 300 px wide and rotate a quarter turn on the device, so the upload is small and upright."
      :steps="[
        'Press Pick image and choose a photo',
        'Press manipulate() chain',
        'Compare the result size with the original',
      ]"
      expect="The result below is 300 px wide and rotated 90 degrees, with its new file URI. The deprecated manipulateAsync gives the same picture."
    >
      <ActionButton
        testID="image-manipulator-pick-button"
        title="Pick image (image-picker)"
        :onPress="pickSource"
        :color="color"
      />
      <Field
        testID="image-manipulator-source-input"
        label="source uri"
        :value="source"
        :onChange="next => (source = next)"
        placeholder="file:///…"
      />
      <ActionButton
        testID="image-manipulator-chain-button"
        title="manipulate() chain"
        :onPress="runChain"
        :color="color"
      />
      <ActionButton
        testID="image-manipulator-legacy-button"
        title="manipulateAsync() (deprecated)"
        :onPress="runLegacy"
        :color="color"
      />
      <ImageManipulatorHookRunner v-if="source !== ''" :source="source" :color="color" :run="runHook" />
      <ResultRow testID="image-manipulator-status" label="Status" :value="status" />
      <ImageManipulatorResult v-if="result" :result="result" />
    </Scenario>
    <Explorer testID="image-manipulator-explorer" :color="color">
      <ImageManipulatorOps :ops="ops" :setOps="setOps" :color="color" />
    </Explorer>
  </ScreenShell>
</template>
