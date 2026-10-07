<script lang="ts">
  import ScreenShell from '../components/ScreenShell.svelte';
  import { lineColorOf } from '../components/line-color';
  import { ROUTE_NAME } from '../routes';
  import GlCameraTextureScenario from './GlCameraTextureScenario.svelte';
  import GlFilterScenario from './GlFilterScenario.svelte';
  import GlHeadlessScenario from './GlHeadlessScenario.svelte';
  import GlInfoScenario from './GlInfoScenario.svelte';
  import GlShaderScenario from './GlShaderScenario.svelte';
  import GlTriangleScenario from './GlTriangleScenario.svelte';

  const ROUTE = ROUTE_NAME.Gl;
  const color = lineColorOf(ROUTE);
</script>

<ScreenShell
  route={ROUTE}
  testID="gl-scroll"
  title="GL"
  body="A native OpenGL surface with a WebGL context: custom animation, shader effects, GPU photo filters and offscreen rendering, no UI-view limits."
>
  <GlTriangleScenario {color} />
  <GlShaderScenario {color} />
  <GlFilterScenario {color} />
  <GlCameraTextureScenario {color} />
  <GlHeadlessScenario {color} />
  <GlInfoScenario {color} />
</ScreenShell>
