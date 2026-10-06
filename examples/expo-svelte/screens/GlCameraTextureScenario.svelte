<script lang="ts">
  import { CameraView, useCameraPermissions } from '@symbiote-native/camera/svelte';
  import type { ICameraViewHandle } from '@symbiote-native/camera/svelte';
  import { GLView } from '@symbiote-native/gl/svelte';
  import type { IExpoWebGLRenderingContext, IGLViewHandle } from '@symbiote-native/gl/svelte';
  import ActionButton from '../components/ActionButton.svelte';
  import ChoiceRow from '../components/ChoiceRow.svelte';
  import ResultRow from '../components/ResultRow.svelte';
  import Scenario from '../components/Scenario.svelte';
  import { FILTERS, FULL_RATE, INITIAL_LOOP_VIEW, createFrameLoop, errorLine } from './gl-frame-loop';
  import { cameraScene } from './gl-shaders';

  const { color }: { color: string } = $props();

  const permission = useCameraPermissions();
  let camera = $state<ICameraViewHandle | undefined>();
  let glView = $state<IGLViewHandle | undefined>();
  let context: IExpoWebGLRenderingContext | null = null;
  let mode = 0;
  let view = $state(INITIAL_LOOP_VIEW);
  let filter = $state(0);
  let line = $state('not started');
  const loop = createFrameLoop({ getMaxFps: () => FULL_RATE, onChange: next => (view = next) });
  $effect(() => () => loop.dispose());

  async function startFilter(): Promise<void> {
    const node = camera?.getHostNode() ?? null;
    const gl = context;
    if (node === null || gl === null) {
      line = 'the camera or the GL surface is not ready yet';
      return;
    }
    line = 'creating the texture…';
    try {
      const texture = await glView?.createCameraTextureAsync(node);
      if (texture !== undefined) {
        loop.start(cameraScene(gl, texture, () => mode));
        line = 'live';
      }
    } catch (error: unknown) {
      line = `failed: ${errorLine(error)}`;
    }
  }

  function changeFilter(value: number): void {
    mode = value;
    filter = value;
  }
</script>

<Scenario
  testID="gl-camera-scenario"
  title="Filter the live camera picture on the GPU"
  why="Camera filters, AR overlays and video effects take every camera frame as a texture and draw it through a shader, so the effect keeps up with the preview."
  steps={['Allow the camera', 'Press Start live filter', 'Switch between grey, sepia and invert']}
  expect="The GL view below shows the camera picture, recolored by the chosen filter, and keeps updating. The frame rate line counts the drawn frames."
>
  {#if permission.status?.granted === true}
    <CameraView testID="gl-camera-source" bind:this={camera} class="gl-camera-source" />
    <GLView
      testID="gl-camera-view"
      bind:this={glView}
      class="gl-view"
      onContextCreate={gl => {
        context = gl;
      }}
    />
    <ActionButton testID="gl-camera-start" title="Start live filter" {color} onPress={startFilter} />
    <ChoiceRow testID="gl-camera-filter" label="filter" {color} value={filter} options={FILTERS} onChange={changeFilter} />
  {:else}
    <ActionButton testID="gl-camera-allow" title="Allow the camera" {color} onPress={() => void permission.requestPermission()} />
  {/if}
  <ResultRow testID="gl-camera-status" label="createCameraTextureAsync" value={line} />
  <ResultRow testID="gl-camera-fps" label="Frames per second" value={String(view.fps)} />
  <text class="hero-body">Needs a device with a camera: the iOS simulator has none.</text>
</Scenario>
