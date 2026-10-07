<script setup lang="ts">
import { ref } from 'vue';
import { CameraView, useCameraPermissions } from '@symbiote-native/camera/vue';
import type { ICameraViewHandle } from '@symbiote-native/camera/vue';
import { GLView } from '@symbiote-native/gl/vue';
import type { IExpoWebGLRenderingContext, IGLViewHandle } from '@symbiote-native/gl/vue';
import ActionButton from '../components/ActionButton.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import { FILTERS, errorLine } from './gl-frame-loop';
import { cameraScene } from './gl-shaders';
import { useFrameLoop } from './gl-use-frame-loop';

defineProps<{ color: string }>();

const [permission, requestPermission] = useCameraPermissions();
const camera = ref<ICameraViewHandle | null>(null);
const glView = ref<IGLViewHandle | null>(null);
let context: IExpoWebGLRenderingContext | null = null;
let mode = 0;
const { view, loop } = useFrameLoop();
const filter = ref(0);
const line = ref('not started');

function onContextCreate(gl: IExpoWebGLRenderingContext): void {
  context = gl;
}

async function startFilter(): Promise<void> {
  const node = camera.value?.getHostNode() ?? null;
  const gl = context;
  if (node === null || gl === null) {
    line.value = 'the camera or the GL surface is not ready yet';
    return;
  }
  line.value = 'creating the texture…';
  try {
    const texture = await glView.value?.createCameraTextureAsync(node);
    if (texture !== undefined) {
      loop.start(cameraScene(gl, texture, () => mode));
      line.value = 'live';
    }
  } catch (error: unknown) {
    line.value = `failed: ${errorLine(error)}`;
  }
}

function changeFilter(value: number): void {
  mode = value;
  filter.value = value;
}
</script>

<template>
  <Scenario
    testID="gl-camera-scenario"
    title="Filter the live camera picture on the GPU"
    why="Camera filters, AR overlays and video effects take every camera frame as a texture and draw it through a shader, so the effect keeps up with the preview."
    :steps="['Allow the camera', 'Press Start live filter', 'Switch between grey, sepia and invert']"
    expect="The GL view below shows the camera picture, recolored by the chosen filter, and keeps updating. The frame rate line counts the drawn frames."
  >
    <template v-if="permission?.granted === true">
      <CameraView
        ref="camera"
        testID="gl-camera-source"
        class="gl-camera-source"
      />
      <GLView
        ref="glView"
        testID="gl-camera-view"
        class="gl-view"
        @contextCreate="onContextCreate"
      />
      <ActionButton
        testID="gl-camera-start"
        title="Start live filter"
        :color="color"
        @press="startFilter"
      />
      <ChoiceRow
        testID="gl-camera-filter"
        label="filter"
        :color="color"
        :value="filter"
        :options="FILTERS"
        @change="changeFilter"
      />
    </template>
    <ActionButton
      v-else
      testID="gl-camera-allow"
      title="Allow the camera"
      :color="color"
      @press="requestPermission()"
    />
    <ResultRow
      testID="gl-camera-status"
      label="createCameraTextureAsync"
      :value="line"
    />
    <ResultRow
      testID="gl-camera-fps"
      label="Frames per second"
      :value="String(view.fps)"
    />
    <text class="hero-body">
      Needs a device with a camera: the iOS simulator has none.
    </text>
  </Scenario>
</template>
