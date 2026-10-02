<script setup lang="ts">
import { ref } from 'vue';
import Explorer from '../components/Explorer.vue';
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import { INITIAL_FORM } from './image-picker-form';
import type { IForm } from './image-picker-form';
import ImagePickerLaunch from './ImagePickerLaunch.vue';
import ImagePickerOptions from './ImagePickerOptions.vue';
import ImagePickerPermissions from './ImagePickerPermissions.vue';

const ROUTE = ROUTE_NAME.ImagePicker;
const color = lineColorOf(ROUTE);

const form = ref<IForm>({ ...INITIAL_FORM });

function setForm(patch: Partial<IForm>): void {
  form.value = { ...form.value, ...patch };
}
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="image-picker-scroll"
    title="Image Picker"
    body="Let users pick photos and videos from the library or shoot them with the camera, with optional cropping, several selections and video presets."
  >
    <ImagePickerLaunch :form="form" :color="color" />
    <Explorer testID="image-picker-explorer" :color="color">
      <ImagePickerPermissions />
      <ImagePickerOptions :form="form" :setForm="setForm" :color="color" />
    </Explorer>
  </ScreenShell>
</template>
