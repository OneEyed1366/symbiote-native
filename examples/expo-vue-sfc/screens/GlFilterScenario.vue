<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue';
import { Asset } from '@symbiote-native/asset';
import { GLView } from '@symbiote-native/gl/vue';
import type { IExpoWebGLRenderingContext } from '@symbiote-native/gl/vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { FILTERS, errorLine } from './gl-frame-loop';
import { filterScene } from './gl-shaders';
import type { IFilterScene } from './gl-shaders';
import { photoUrl } from './image-assets';

defineProps<{ color: string }>();

let scene: IFilterScene | null = null;
const filter = ref(0);
const asset = shallowRef<Asset | null>(null);
const line = ref('downloading the photo…');

async function download(): Promise<void> {
  try {
    asset.value = await Asset.fromURI(photoUrl('1025', 512)).downloadAsync();
    line.value = 'photo ready';
  } catch (error: unknown) {
    line.value = `failed: ${errorLine(error)}`;
  }
}
void download();

watch(filter, value => scene?.draw(value));

function onContextCreate(gl: IExpoWebGLRenderingContext): void {
  try {
    scene = filterScene(gl, asset.value);
    scene.draw(filter.value);
  } catch (error: unknown) {
    line.value = `failed: ${errorLine(error)}`;
  }
}
</script>

<template>
  <Scenario
    testID="gl-filter-scenario"
    title="Apply a photo filter on the GPU"
    why="Photo editors upload the picture as a texture and a shader recolors every pixel at once, so a filter changes the preview instantly even on a large image."
    :steps="['Wait until the photo is ready', 'Press grey, sepia, invert and original in turn']"
    expect="The picture is redrawn at once for every filter: grey is monochrome, sepia is warm brown, invert flips every color, original returns the photo."
  >
    <ResultRow
      testID="gl-filter-status"
      label="Photo"
      :value="line"
    />
    <GLView
      v-if="asset !== null"
      :key="asset.uri"
      testID="gl-filter"
      class="gl-view"
      @contextCreate="onContextCreate"
    />
    <ChoiceRow
      testID="gl-filter-choice"
      label="filter"
      :color="color"
      :value="filter"
      :options="FILTERS"
      @change="value => (filter = value)"
    />
  </Scenario>
</template>
