import { defineComponent, ref } from 'vue';
import { ActionButton } from '../components/ActionButton';
import { Scenario } from '../components/Scenario';
import { Card, ResultRow, ScreenShell, lineColorOf } from '../components/ScreenShell';
import { ROUTE_NAME } from '../routes';
import { CameraTextureScenario } from './gl-camera';
import { readGpuInfo, renderOffscreen } from './gl-headless';
import type { IHeadlessResult, IInfoResult } from './gl-headless';
import { FilterScenario, ShaderScenario, TriangleScenario } from './gl-scenes';

const ROUTE = ROUTE_NAME.Gl;
const NOT_READ = 'not read';
const color = lineColorOf(ROUTE);

const HeadlessScenario = defineComponent(
  () => {
    const result = ref<IHeadlessResult>({ snapshot: null, line: 'not run' });
    const run = async () => {
      result.value = { snapshot: result.value.snapshot, line: 'rendering…' };
      const next = await renderOffscreen();
      result.value = { snapshot: next.snapshot ?? result.value.snapshot, line: next.line };
    };
    return () => (
      <Scenario
        testID="gl-headless-scenario"
        title="Render an image with no view on screen"
        why="Thumbnails, charts for a report or an image effect for a share can be drawn in the background with a context that has no view, then saved as a file."
        steps={['Press Render offscreen']}
        expect="An orange square image with a violet square in its middle appears below, 256 by 256 pixels. No GL view was on screen while it was drawn."
      >
        <ActionButton testID="gl-headless-run" title="Render offscreen" color={color} onPress={() => void run()} />
        <ResultRow testID="gl-headless-result" label="createContextAsync" value={result.value.line} />
        {result.value.snapshot !== null && <image testID="gl-headless-image" source={{ uri: result.value.snapshot.localUri }} class="gl-snapshot" />}
      </Scenario>
    );
  },
  { name: 'HeadlessScenario' },
);

const InfoScenario = defineComponent(
  () => {
    const result = ref<IInfoResult>({ info: null, line: 'logging off' });
    const read = async () => {
      const next = await readGpuInfo();
      result.value = { info: next.info ?? result.value.info, line: next.line };
    };
    return () => (
      <Card testID="gl-info-card" title="What this GPU offers, and call logging">
        <text class="hero-body">
          Apps check the limits before choosing a texture size, and turn on call logging to debug a black view. Logging prints to the Metro console with console.warn.
        </text>
        <ActionButton testID="gl-info" title="Read GPU info and log two calls" color={color} onPress={() => void read()} />
        <ResultRow testID="gl-info-version" label="VERSION" value={result.value.info?.version ?? NOT_READ} />
        <ResultRow testID="gl-info-renderer" label="RENDERER" value={result.value.info?.renderer ?? NOT_READ} />
        <ResultRow testID="gl-info-vendor" label="VENDOR" value={result.value.info?.vendor ?? NOT_READ} />
        <ResultRow testID="gl-info-max-texture" label="MAX_TEXTURE_SIZE" value={result.value.info?.maxTexture ?? NOT_READ} />
        <ResultRow testID="gl-info-logging" label="__expoSetLogging" value={result.value.line} />
        <text class="hero-body">
          Not shown here: getWorkletContext hands the context to a Reanimated worklet thread.
        </text>
      </Card>
    );
  },
  { name: 'InfoScenario' },
);

export const GlScreen = defineComponent(
  () => () => (
    <ScreenShell
      route={ROUTE}
      testID="gl-scroll"
      title="GL"
      body="A native OpenGL surface with a WebGL context: custom animation, shader effects, GPU photo filters and offscreen rendering, no UI-view limits."
    >
      <TriangleScenario />
      <ShaderScenario />
      <FilterScenario />
      <CameraTextureScenario />
      <HeadlessScenario />
      <InfoScenario />
    </ScreenShell>
  ),
  { name: 'GlScreen' },
);
