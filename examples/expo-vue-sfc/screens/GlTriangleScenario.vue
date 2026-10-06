<script setup lang="ts">
import { ref } from 'vue';
import { GLView } from '@symbiote-native/gl/vue';
import type { IExpoWebGLRenderingContext } from '@symbiote-native/gl/vue';
import ResultRow from '../components/ResultRow.vue';
import Scenario from '../components/Scenario.vue';
import ToggleRow from '../components/ToggleRow.vue';
import { errorLine } from './gl-frame-loop';
import { triangleScene } from './gl-shaders';
import { useFrameLoop } from './gl-use-frame-loop';

defineProps<{ color: string }>();

const { view, loop } = useFrameLoop();
const line = ref('waiting for the surface');

function onContextCreate(gl: IExpoWebGLRenderingContext): void {
  try {
    loop.start(triangleScene(gl));
    line.value = 'drawing';
  } catch (error: unknown) {
    line.value = `failed: ${errorLine(error)}`;
  }
}
</script>

<template>
  <Scenario
    testID="gl-triangle-scenario"
    title="Draw your own animation on the GPU"
    why="Games, loaders, charts and visual effects that a view tree cannot do run as WebGL: a vertex and a fragment shader draw every frame at screen speed, outside the UI layout."
    :steps="['Wait for the triangle to appear', 'Watch it turn and read the frame rate']"
    expect="A triangle with a red, green and blue corner spins smoothly on a dark background. The frame rate line settles near the screen refresh rate, 60 on most devices."
  >
    <GLView
      testID="gl-triangle"
      class="gl-view"
      @contextCreate="onContextCreate"
    />
    <ResultRow
      testID="gl-triangle-status"
      label="Surface"
      :value="line"
    />
    <ResultRow
      testID="gl-triangle-fps"
      label="Frames per second"
      :value="String(view.fps)"
    />
    <ResultRow
      testID="gl-triangle-loop"
      label="Draw loop"
      :value="view.stats"
    />
    <ToggleRow
      testID="gl-triangle-run"
      label="Animate"
      :value="view.isRunning"
      :color="color"
      @change="loop.toggle"
    />
  </Scenario>
</template>
