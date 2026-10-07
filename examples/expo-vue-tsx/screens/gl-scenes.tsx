import { defineComponent, onScopeDispose, ref, watch } from 'vue';
import { GLView } from '@symbiote-native/gl/vue';
import type { IExpoWebGLRenderingContext, IGLSnapshot, IGLViewHandle } from '@symbiote-native/gl/vue';
import { Asset } from '@symbiote-native/asset';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { ChoiceRow, ResultRow, ToggleRow, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { FILTERS, FULL_RATE, INITIAL_LOOP_VIEW, RATE_CAPS, SHADER_RATE, createFrameLoop, errorLine } from './gl-frame-loop';
import { filterScene, shaderScene, triangleScene } from './gl-shaders';
import type { IFilterScene, IShaderName } from './gl-shaders';
import { photoUrl } from './image-assets';

const color = lineColorOf(ROUTE_NAME.Gl);
const SHADERS: readonly IShaderName[] = ['plasma', 'waves', 'checker'];
const SHADER_OPTIONS = SHADERS.map(item => ({ label: item, value: item }));

// A render loop that stops with the component and can be paused, with a report of its frames
export function useFrameLoop(getMaxFps: () => number = () => FULL_RATE) {
  const view = ref(INITIAL_LOOP_VIEW);
  const loop = createFrameLoop({
    getMaxFps,
    onChange: next => {
      view.value = next;
    },
  });
  onScopeDispose(loop.dispose);
  return { view, loop };
}

export const TriangleScenario = defineComponent(
  () => {
    const { view, loop } = useFrameLoop();
    const line = ref('waiting for the surface');
    const onContextCreate = (gl: IExpoWebGLRenderingContext) => {
      try {
        loop.start(triangleScene(gl));
        line.value = 'drawing';
      } catch (error: unknown) {
        line.value = `failed: ${errorLine(error)}`;
      }
    };
    return () => (
      <Scenario
        testID="gl-triangle-scenario"
        title="Draw your own animation on the GPU"
        why="Games, loaders, charts and visual effects that a view tree cannot do run as WebGL: a vertex and a fragment shader draw every frame at screen speed, outside the UI layout."
        steps={['Wait for the triangle to appear', 'Watch it turn and read the frame rate']}
        expect="A triangle with a red, green and blue corner spins smoothly on a dark background. The frame rate line settles near the screen refresh rate, 60 on most devices."
      >
        <GLView testID="gl-triangle" class="gl-view" onContextCreate={onContextCreate} />
        <ResultRow testID="gl-triangle-status" label="Surface" value={line.value} />
        <ResultRow testID="gl-triangle-fps" label="Frames per second" value={String(view.value.fps)} />
        <ResultRow testID="gl-triangle-loop" label="Draw loop" value={view.value.stats} />
        <ToggleRow testID="gl-triangle-run" label="Animate" value={view.value.isRunning} onChange={loop.toggle} color={color} />
      </Scenario>
    );
  },
  { name: 'TriangleScenario' },
);

export const ShaderScenario = defineComponent(
  () => {
    const handle = ref<IGLViewHandle | null>(null);
    const maxFps = ref(SHADER_RATE);
    const { view, loop } = useFrameLoop(() => maxFps.value);
    const shader = ref<IShaderName>('plasma');
    const snapshot = ref<IGLSnapshot | null>(null);
    const line = ref('no snapshot yet');
    const onContextCreate = (gl: IExpoWebGLRenderingContext) => {
      try {
        loop.start(shaderScene(gl, shader.value));
      } catch (error: unknown) {
        line.value = `shader failed: ${errorLine(error)}`;
      }
    };
    const capture = async () => {
      try {
        const result = await handle.value?.takeSnapshotAsync({ format: 'png' });
        if (result !== undefined) {
          snapshot.value = result;
          line.value = `${result.width}x${result.height}`;
        }
      } catch (error: unknown) {
        line.value = `failed: ${errorLine(error)}`;
      }
    };
    return () => (
      <Scenario
        testID="gl-shader-scenario"
        title="Run a visual effect and export a frame"
        why="Animated backgrounds, transitions and generated art are a fragment shader over the whole view. Taking a snapshot saves the current frame as an image to share or upload."
        steps={['Pick another effect and watch the view restart', 'Press Take snapshot']}
        expect="Each effect animates on its own. After the snapshot a still copy of the frame appears under the buttons with its pixel size."
      >
        <GLView key={shader.value} testID="gl-shader" ref={handle} msaaSamples={0} class="gl-view" onContextCreate={onContextCreate} />
        <ChoiceRow testID="gl-shader-choice" label="effect" color={color} value={shader.value} options={SHADER_OPTIONS} onChange={value => { shader.value = value; }} />
        <ResultRow testID="gl-shader-fps" label="Frames per second" value={String(view.value.fps)} />
        <ResultRow testID="gl-shader-loop" label="Draw loop" value={view.value.stats} />
        <ChoiceRow testID="gl-shader-rate" label="frame rate cap" color={color} value={maxFps.value} options={RATE_CAPS} onChange={value => { maxFps.value = value; }} />
        <ToggleRow testID="gl-shader-run" label="Animate" value={view.value.isRunning} onChange={loop.toggle} color={color} />
        <ActionButton testID="gl-snapshot" title="Take snapshot" color={color} onPress={() => void capture()} />
        <ResultRow testID="gl-snapshot-result" label="takeSnapshotAsync" value={line.value} />
        {snapshot.value !== null && <image testID="gl-snapshot-image" source={{ uri: snapshot.value.localUri }} class="gl-snapshot" />}
      </Scenario>
    );
  },
  { name: 'ShaderScenario' },
);

export const FilterScenario = defineComponent(
  () => {
    let scene: IFilterScene | null = null;
    const filter = ref(0);
    const asset = ref<Asset | null>(null);
    const line = ref('downloading the photo…');
    const download = async () => {
      try {
        asset.value = await Asset.fromURI(photoUrl('1025', 512)).downloadAsync();
        line.value = 'photo ready';
      } catch (error: unknown) {
        line.value = `failed: ${errorLine(error)}`;
      }
    };
    void download();
    watch(filter, value => scene?.draw(value));
    const onContextCreate = (gl: IExpoWebGLRenderingContext) => {
      try {
        scene = filterScene(gl, asset.value);
        scene.draw(filter.value);
      } catch (error: unknown) {
        line.value = `failed: ${errorLine(error)}`;
      }
    };
    return () => (
      <Scenario
        testID="gl-filter-scenario"
        title="Apply a photo filter on the GPU"
        why="Photo editors upload the picture as a texture and a shader recolors every pixel at once, so a filter changes the preview instantly even on a large image."
        steps={['Wait until the photo is ready', 'Press grey, sepia, invert and original in turn']}
        expect="The picture is redrawn at once for every filter: grey is monochrome, sepia is warm brown, invert flips every color, original returns the photo."
      >
        <ResultRow testID="gl-filter-status" label="Photo" value={line.value} />
        {asset.value !== null && <GLView key={asset.value.uri} testID="gl-filter" class="gl-view" onContextCreate={onContextCreate} />}
        <ChoiceRow testID="gl-filter-choice" label="filter" color={color} value={filter.value} options={FILTERS} onChange={value => { filter.value = value; }} />
      </Scenario>
    );
  },
  { name: 'FilterScenario' },
);
