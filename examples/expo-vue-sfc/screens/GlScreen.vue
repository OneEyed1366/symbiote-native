<script setup lang="ts">
import ScreenShell from '../components/ScreenShell.vue';
import { lineColorOf } from '../components/line-color';
import { ROUTE_NAME } from '../routes';
import GlCameraTextureScenario from './GlCameraTextureScenario.vue';
import GlFilterScenario from './GlFilterScenario.vue';
import GlHeadlessScenario from './GlHeadlessScenario.vue';
import GlInfoScenario from './GlInfoScenario.vue';
import GlShaderScenario from './GlShaderScenario.vue';
import GlTriangleScenario from './GlTriangleScenario.vue';

const ROUTE = ROUTE_NAME.Gl;
const color = lineColorOf(ROUTE);
</script>

<template>
  <ScreenShell
    :route="ROUTE"
    testID="gl-scroll"
    title="GL"
    body="A native OpenGL surface with a WebGL context: custom animation, shader effects, GPU photo filters and offscreen rendering, no UI-view limits."
  >
    <GlTriangleScenario :color="color" />
    <GlShaderScenario :color="color" />
    <GlFilterScenario :color="color" />
    <GlCameraTextureScenario :color="color" />
    <GlHeadlessScenario :color="color" />
    <GlInfoScenario :color="color" />
  </ScreenShell>
</template>
