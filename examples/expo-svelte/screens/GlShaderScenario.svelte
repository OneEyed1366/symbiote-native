<script lang="ts">
  import { GLView } from '@symbiote-native/gl/svelte';
  import type { IExpoWebGLRenderingContext, IGLSnapshot, IGLViewHandle } from '@symbiote-native/gl/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import ToggleRow from '../components/ToggleRow.svelte';
  import { INITIAL_LOOP_VIEW, RATE_CAPS, SHADER_RATE, createFrameLoop, errorLine } from './gl-frame-loop';
  import { shaderScene } from './gl-shaders';
  import type { IShaderName } from './gl-shaders';

  const { color }: { color: string } = $props();

  const SHADERS: readonly IShaderName[] = ['plasma', 'waves', 'checker'];
  const SHADER_OPTIONS = SHADERS.map(item => ({ label: item, value: item }));

  let handle = $state<IGLViewHandle | undefined>();
  let maxFps = $state(SHADER_RATE);
  let view = $state(INITIAL_LOOP_VIEW);
  let shader = $state<IShaderName>('plasma');
  let snapshot = $state.raw<IGLSnapshot | null>(null);
  let line = $state('no snapshot yet');
  const loop = createFrameLoop({ getMaxFps: () => maxFps, onChange: next => (view = next) });
  $effect(() => () => loop.dispose());

  function onContextCreate(gl: IExpoWebGLRenderingContext): void {
    try {
      loop.start(shaderScene(gl, shader));
    } catch (error: unknown) {
      line = `shader failed: ${errorLine(error)}`;
    }
  }

  async function capture(): Promise<void> {
    try {
      const result = await handle?.takeSnapshotAsync({ format: 'png' });
      if (result !== undefined) {
        snapshot = result;
        line = `${result.width}x${result.height}`;
      }
    } catch (error: unknown) {
      line = `failed: ${errorLine(error)}`;
    }
  }
</script>

<Scenario
  testID="gl-shader-scenario"
  title="Run a visual effect and export a frame"
  why="Animated backgrounds, transitions and generated art are a fragment shader over the whole view. Taking a snapshot saves the current frame as an image to share or upload."
  steps={['Pick another effect and watch the view restart', 'Press Take snapshot']}
  expect="Each effect animates on its own. After the snapshot a still copy of the frame appears under the buttons with its pixel size."
>
  {#key shader}
    <GLView testID="gl-shader" bind:this={handle} msaaSamples={0} class="gl-view" {onContextCreate} />
  {/key}
  <ChoiceRow testID="gl-shader-choice" label="effect" {color} value={shader} options={SHADER_OPTIONS} onChange={value => (shader = value)} />
  <ResultRow testID="gl-shader-fps" label="Frames per second" value={String(view.fps)} />
  <ResultRow testID="gl-shader-loop" label="Draw loop" value={view.stats} />
  <ChoiceRow testID="gl-shader-rate" label="frame rate cap" {color} value={maxFps} options={RATE_CAPS} onChange={value => (maxFps = value)} />
  <ToggleRow testID="gl-shader-run" label="Animate" value={view.isRunning} onChange={loop.toggle} {color} />
  <ActionButton testID="gl-snapshot" title="Take snapshot" {color} onPress={capture} />
  <ResultRow testID="gl-snapshot-result" label="takeSnapshotAsync" value={line} />
  {#if snapshot !== null}
    <image testID="gl-snapshot-image" source={{ uri: snapshot.localUri }} class="gl-snapshot" />
  {/if}
</Scenario>
