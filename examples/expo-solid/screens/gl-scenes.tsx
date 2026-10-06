import { Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { GLView } from '@symbiote-native/gl/solid';
import type { IExpoWebGLRenderingContext, IGLSnapshot, IGLViewHandle } from '@symbiote-native/gl/solid';
import { Asset } from '@symbiote-native/asset';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ChoiceRow, ResultRow, ToggleRow } from '../components/ScreenShell';
import { FILTERS, FULL_RATE, INITIAL_LOOP_VIEW, RATE_CAPS, SHADER_RATE, createFrameLoop, errorLine } from './gl-frame-loop';
import { filterScene, shaderScene, triangleScene } from './gl-shaders';
import type { IFilterScene, IShaderName } from './gl-shaders';
import { photoUrl } from './image-assets';

const SHADERS: readonly IShaderName[] = ['plasma', 'waves', 'checker'];
const SHADER_OPTIONS = SHADERS.map(item => ({ label: item, value: item }));

// A render loop that stops with the component and can be paused, with a report of its frames
export function useFrameLoop(getMaxFps: () => number = () => FULL_RATE) {
  const [view, setView] = createSignal(INITIAL_LOOP_VIEW);
  const loop = createFrameLoop({ getMaxFps, onChange: setView });
  onCleanup(loop.dispose);
  return { view, loop };
}

export function TriangleScenario(props: { color: string }) {
  const { view, loop } = useFrameLoop();
  const [line, setLine] = createSignal('waiting for the surface');
  const onContextCreate = (gl: IExpoWebGLRenderingContext) => {
    try {
      loop.start(triangleScene(gl));
      setLine('drawing');
    } catch (error: unknown) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Scenario
      testID="gl-triangle-scenario"
      title="Draw your own animation on the GPU"
      why="Games, loaders, charts and visual effects that a view tree cannot do run as WebGL: a vertex and a fragment shader draw every frame at screen speed, outside the UI layout."
      steps={['Wait for the triangle to appear', 'Watch it turn and read the frame rate']}
      expect="A triangle with a red, green and blue corner spins smoothly on a dark background. The frame rate line settles near the screen refresh rate, 60 on most devices."
    >
      <GLView testID="gl-triangle" class="gl-view" onContextCreate={onContextCreate} />
      <ResultRow testID="gl-triangle-status" label="Surface" value={line()} />
      <ResultRow testID="gl-triangle-fps" label="Frames per second" value={String(view().fps)} />
      <ResultRow testID="gl-triangle-loop" label="Draw loop" value={view().stats} />
      <ToggleRow testID="gl-triangle-run" label="Animate" value={view().isRunning} onChange={loop.toggle} color={props.color} />
    </Scenario>
  );
}

export function ShaderScenario(props: { color: string }) {
  const [handle, setHandle] = createSignal<IGLViewHandle>();
  const [maxFps, setMaxFps] = createSignal(SHADER_RATE);
  const { view, loop } = useFrameLoop(maxFps);
  const [shader, setShader] = createSignal<IShaderName>('plasma');
  const [snapshot, setSnapshot] = createSignal<IGLSnapshot | null>(null);
  const [line, setLine] = createSignal('no snapshot yet');
  const onContextCreate = (gl: IExpoWebGLRenderingContext, name: IShaderName) => {
    try {
      loop.start(shaderScene(gl, name));
    } catch (error: unknown) {
      setLine(`shader failed: ${errorLine(error)}`);
    }
  };
  const capture = async () => {
    try {
      const result = await handle()?.takeSnapshotAsync({ format: 'png' });
      if (result !== undefined) {
        setSnapshot(result);
        setLine(`${result.width}x${result.height}`);
      }
    } catch (error: unknown) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Scenario
      testID="gl-shader-scenario"
      title="Run a visual effect and export a frame"
      why="Animated backgrounds, transitions and generated art are a fragment shader over the whole view. Taking a snapshot saves the current frame as an image to share or upload."
      steps={['Pick another effect and watch the view restart', 'Press Take snapshot']}
      expect="Each effect animates on its own. After the snapshot a still copy of the frame appears under the buttons with its pixel size."
    >
      {/* `Show` re-runs a keyed callback only if it takes the value */}
      <Show when={shader()} keyed>
        {(name: IShaderName) => (
          <GLView
            testID="gl-shader"
            ref={setHandle}
            msaaSamples={0}
            class="gl-view"
            onContextCreate={gl => onContextCreate(gl, name)}
          />
        )}
      </Show>
      <ChoiceRow testID="gl-shader-choice" label="effect" color={props.color} value={shader()} options={SHADER_OPTIONS} onChange={setShader} />
      <ResultRow testID="gl-shader-fps" label="Frames per second" value={String(view().fps)} />
      <ResultRow testID="gl-shader-loop" label="Draw loop" value={view().stats} />
      <ChoiceRow testID="gl-shader-rate" label="frame rate cap" color={props.color} value={maxFps()} options={RATE_CAPS} onChange={setMaxFps} />
      <ToggleRow testID="gl-shader-run" label="Animate" value={view().isRunning} onChange={loop.toggle} color={props.color} />
      <ActionButton testID="gl-snapshot" title="Take snapshot" color={props.color} onPress={() => void capture()} />
      <ResultRow testID="gl-snapshot-result" label="takeSnapshotAsync" value={line()} />
      <Show when={snapshot()}>
        {shot => <image testID="gl-snapshot-image" source={{ uri: shot().localUri }} class="gl-snapshot" />}
      </Show>
    </Scenario>
  );
}

export function FilterScenario(props: { color: string }) {
  let scene: IFilterScene | null = null;
  const [filter, setFilter] = createSignal(0);
  const [asset, setAsset] = createSignal<Asset | null>(null);
  const [line, setLine] = createSignal('downloading the photo…');
  onMount(async () => {
    try {
      setAsset(await Asset.fromURI(photoUrl('1025', 512)).downloadAsync());
      setLine('photo ready');
    } catch (error: unknown) {
      setLine(`failed: ${errorLine(error)}`);
    }
  });
  // The read comes first, `scene?.draw(filter())` skips it while `scene` is null
  createEffect(() => {
    const current = filter();
    scene?.draw(current);
  });
  const onContextCreate = (gl: IExpoWebGLRenderingContext) => {
    try {
      scene = filterScene(gl, asset());
      scene.draw(filter());
    } catch (error: unknown) {
      setLine(`failed: ${errorLine(error)}`);
    }
  };
  return (
    <Scenario
      testID="gl-filter-scenario"
      title="Apply a photo filter on the GPU"
      why="Photo editors upload the picture as a texture and a shader recolors every pixel at once, so a filter changes the preview instantly even on a large image."
      steps={['Wait until the photo is ready', 'Press grey, sepia, invert and original in turn']}
      expect="The picture is redrawn at once for every filter: grey is monochrome, sepia is warm brown, invert flips every color, original returns the photo."
    >
      <ResultRow testID="gl-filter-status" label="Photo" value={line()} />
      <Show when={asset()} keyed>
        {() => <GLView testID="gl-filter" class="gl-view" onContextCreate={onContextCreate} />}
      </Show>
      <ChoiceRow testID="gl-filter-choice" label="filter" color={props.color} value={filter()} options={FILTERS} onChange={setFilter} />
    </Scenario>
  );
}
