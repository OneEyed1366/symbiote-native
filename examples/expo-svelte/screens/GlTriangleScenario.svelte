<script lang="ts">
  import { GLView } from '@symbiote-native/gl/svelte';
  import type { IExpoWebGLRenderingContext } from '@symbiote-native/gl/svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { FULL_RATE, INITIAL_LOOP_VIEW, createFrameLoop, errorLine } from './gl-frame-loop';
  import { triangleScene } from './gl-shaders';

  const { color }: { color: string } = $props();

  let view = $state(INITIAL_LOOP_VIEW);
  let line = $state('waiting for the surface');
  const loop = createFrameLoop({ getMaxFps: () => FULL_RATE, onChange: next => (view = next) });
  $effect(() => () => loop.dispose());

  function onContextCreate(gl: IExpoWebGLRenderingContext): void {
    try {
      loop.start(triangleScene(gl));
      line = 'drawing';
    } catch (error: unknown) {
      line = `failed: ${errorLine(error)}`;
    }
  }
</script>

<Scenario
  testID="gl-triangle-scenario"
  title="Draw your own animation on the GPU"
  why="Games, loaders, charts and visual effects that a view tree cannot do run as WebGL: a vertex and a fragment shader draw every frame at screen speed, outside the UI layout."
  steps={['Wait for the triangle to appear', 'Watch it turn and read the frame rate']}
  expect="A triangle with a red, green and blue corner spins smoothly on a dark background. The frame rate line settles near the screen refresh rate, 60 on most devices."
>
  <GLView testID="gl-triangle" class="gl-view" {onContextCreate} />
  <ResultRow testID="gl-triangle-status" label="Surface" value={line} />
  <ResultRow testID="gl-triangle-fps" label="Frames per second" value={String(view.fps)} />
  <ResultRow testID="gl-triangle-loop" label="Draw loop" value={view.stats} />
  <ToggleRow testID="gl-triangle-run" label="Animate" value={view.isRunning} onChange={loop.toggle} {color} />
</Scenario>
