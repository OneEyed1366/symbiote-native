<script setup lang="ts">
import { ref } from 'vue';
import { GLView } from '@symbiote-native/gl/vue';
import type { IExpoWebGLRenderingContext, IGLSnapshot, IGLViewHandle } from '@symbiote-native/gl/vue';
import ActionButton from '../components/ActionButton.vue';
import ChoiceRow from '../components/ChoiceRow.vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { RATE_CAPS, SHADER_RATE, errorLine } from './gl-frame-loop';
import { shaderScene } from './gl-shaders';
import type { IShaderName } from './gl-shaders';
import { useFrameLoop } from './gl-use-frame-loop';

defineProps<{ color: string }>();

const SHADERS: readonly IShaderName[] = ['plasma', 'waves', 'checker'];
const SHADER_OPTIONS = SHADERS.map(item => ({ label: item, value: item }));
const NO_MSAA = 0;

const handle = ref<IGLViewHandle | null>(null);
const maxFps = ref(SHADER_RATE);
const { view, loop } = useFrameLoop(() => maxFps.value);
const shader = ref<IShaderName>('plasma');
const snapshot = ref<IGLSnapshot | null>(null);
const line = ref('no snapshot yet');

function onContextCreate(gl: IExpoWebGLRenderingContext): void {
  try {
    loop.start(shaderScene(gl, shader.value));
  } catch (error: unknown) {
    line.value = `shader failed: ${errorLine(error)}`;
  }
}

async function capture(): Promise<void> {
  try {
    const result = await handle.value?.takeSnapshotAsync({ format: 'png' });
    if (result !== undefined) {
      snapshot.value = result;
      line.value = `${result.width}x${result.height}`;
    }
  } catch (error: unknown) {
    line.value = `failed: ${errorLine(error)}`;
  }
}
</script>

<template>
  <Scenario
    testID="gl-shader-scenario"
    title="Run a visual effect and export a frame"
    why="Animated backgrounds, transitions and generated art are a fragment shader over the whole view. Taking a snapshot saves the current frame as an image to share or upload."
    :steps="['Pick another effect and watch the view restart', 'Press Take snapshot']"
    expect="Each effect animates on its own. After the snapshot a still copy of the frame appears under the buttons with its pixel size."
  >
    <GLView
      :key="shader"
      ref="handle"
      testID="gl-shader"
      :msaaSamples="NO_MSAA"
      class="gl-view"
      @contextCreate="onContextCreate"
    />
    <ChoiceRow
      testID="gl-shader-choice"
      label="effect"
      :color="color"
      :value="shader"
      :options="SHADER_OPTIONS"
      @change="value => (shader = value)"
    />
    <ResultRow
      testID="gl-shader-fps"
      label="Frames per second"
      :value="String(view.fps)"
    />
    <ResultRow
      testID="gl-shader-loop"
      label="Draw loop"
      :value="view.stats"
    />
    <ChoiceRow
      testID="gl-shader-rate"
      label="frame rate cap"
      :color="color"
      :value="maxFps"
      :options="RATE_CAPS"
      @change="value => (maxFps = value)"
    />
    <ToggleRow
      testID="gl-shader-run"
      label="Animate"
      :value="view.isRunning"
      :color="color"
      @change="loop.toggle"
    />
    <ActionButton
      testID="gl-snapshot"
      title="Take snapshot"
      :color="color"
      @press="capture"
    />
    <ResultRow
      testID="gl-snapshot-result"
      label="takeSnapshotAsync"
      :value="line"
    />
    <image
      v-if="snapshot !== null"
      testID="gl-snapshot-image"
      :source="{ uri: snapshot.localUri }"
      class="gl-snapshot"
    />
  </Scenario>
</template>
